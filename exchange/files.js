/* global require, process */
// -------------------------------------------------------------------------------------------
// Service for files exchange. Allows an external application
// to send and receive data in files, instead of calling API.
// -------------------------------------------------------------------------------------------

const fs = require('fs')
const moment = require('moment-timezone')
const chokidar = require('chokidar')
const csvtojson = require('csvtojson')
const request = require('request')
const equal = require('deep-equal')
const logger = require('../utils/log')
const g = require('../global')

let ONE_DAY = 86400000
let DELETE_MARK = '{{DEL}}'
let log
let remoteDir
let workDir
let timeZone
let remoteService
let createOutput

/*
Initialize variables and watching import files.
*/
const init = () => {
  log = logger.getLogger('files')
  log.debug('>> files.init()')
  let params = g.getConfig().exchange.files
  remoteService = params.server
  timeZone = 'Europe/Madrid'
  remoteDir = params.dir
  workDir = params.workdir
  createOutput = params.output
  watch('RECORDS', processRecord, 'records', 'records', 'records')
  watch('TTYPES', processTtype, 'timetypes', 'timetypes', 'timetypes')
  watch('INFO', processInfo, 'infos', 'records/@/info', 'records/@/info')
  return true
}

/*
Watches over an import file
*/
const watch = (importType, fJson, pathGet, pathPost, pathDelete) => {
  chokidar.watch(remoteDir + '/' + importType + '.DWN', {ignored: /(^|[/\\])\../})
    .on('add', path => moveImportFile(path, importType, fJson, pathGet, pathPost, pathDelete, false))
  chokidar.watch(remoteDir + '/' + importType + '_INC.DWN', {ignored: /(^|[/\\])\../})
    .on('add', path => moveImportFile(path, importType, fJson, pathGet, pathPost, pathDelete, true))
}

/*
Renames the original file to DWT, brings it to working directory,
deletes the original file, and begins import process.
*/
const moveImportFile = (path, importType, fJson, pathGet, pathPost, pathDelete, partial) => {
  log.debug(path)
  if (fs.existsSync(path)) {
    let newPath = path.substring(0, path.length - 1) + 'T'
    fs.rename(path, newPath, (err) => {
      if (err) log.error(err)
      else {
        let endPath = workDir + '/' + 'pending' + '/' + importType + (partial ? '_INC.DWT' : '.DWT')
        try {
          fs.writeFileSync(endPath, fs.readFileSync(newPath))
          fs.unlink(newPath, (err) => { if (err) log.error(err) })
          let now = moment.tz(new Date().getTime(), timeZone).format('YYYYMMDDHHmmss')
          if (createOutput) {
            let logPath = workDir + '/' + 'pending' + '/' + importType + (partial ? '_INC_' : '_') + now + '.LOG'
            let output = fs.createWriteStream(logPath)
            output.once('open', () => importPrepare(endPath, importType, fJson, pathGet, pathPost, pathDelete, output, now, partial))
          } else importPrepare(endPath, importType, fJson, pathGet, pathPost, pathDelete, null, now, partial)
        } catch (err) { log.error(err) }
      }
    })
  }
}

const outPut = (stream, message) => {
  let time = moment.tz(new Date().getTime(), timeZone).format('YYYY-MM-DD HH:mm:ss')
  stream.write(time + ', ' + message + '\r\n')
}

/*
Gets information from server, to manage total import.
*/
const importPrepare = (path, importType, fJson, pathGet, pathPost, pathDelete, output, now, partial) => {
  log.info('Start of ' + importType + ' import')
  if (output) outPut(output, 'Start')
  if (partial) importProcess(null, path, importType, fJson, pathPost, pathDelete, output, now, partial)
  else {
    let errMsg
    call('GET', pathGet, null, (err, response, bodyResponse) => {
      if (err) {
        log.error(err)
        errMsg = err.message
      } else if (response && response.statusCode !== 200 && response.statusCode !== 201) {
        errMsg = 'Error ' + response.statusCode + ' : ' + bodyResponse
        log.error(errMsg)
      } else {
        // Create Map from server response
        let elemsToDelete = {}
        let d = JSON.parse(bodyResponse)
        for (let i = 0; i < d.length; i++) {
          if (importType === 'TTYPES') elemsToDelete['ID' + d[i].code] = d[i]
          else elemsToDelete['ID' + d[i].id] = d[i]
        }
        importProcess(elemsToDelete, path, importType, fJson, pathPost, pathDelete, output, now, partial)
      }

      if (errMsg) {
        if (output) outPut(output, errMsg)
        endImport(path, importType, output, now, false)
      }
    })
  }
}

/*
Converts CSV file to a map or objects,
and calls fJson() for each json.
Then calls
to import it.
*/
const importProcess = (elemsToDelete, path, importType, fJson, pathPost, pathDelete, output, now, partial) => {
  let elems
  if (partial) {
    elems = []
    elemsToDelete = []
  } else elems = {}
  let yesterday = moment.tz(new Date().getTime() - ONE_DAY, timeZone).format('YYYYMMDD')
  csvtojson().fromFile(path)
  .on('json', (jsonObj) => fJson(jsonObj, yesterday, elems, partial, elemsToDelete))
  .on('done', (err) => {
    if (err) {
      log.error(err)
      endImport(path, importType, output, now, false, partial)
    } else {
      if (partial) cleanMap(elemsToDelete, elems)
      sendOrders(pathPost, elems, elemsToDelete, output, partial, (nObjects, nErrors) => {
        if (output) outPut(output, nObjects + ' lines processed. ' + nErrors + ' errors.')
        deleteOrders(pathDelete, elemsToDelete, output, partial,
          () => endImport(path, importType, output, now, true, partial))
      })
    }
  })
}

/*
Removes elements which are equal to those in Lemuria system.
*/
const cleanMap = (elemsToDelete, elems) => {
  let l = []
  for (let k in elems) {
    if (elems.hasOwnProperty(k)) {
      if (elemsToDelete[k]) {
        // We must order arrays before comparing
        orderArrays(elemsToDelete[k])
        orderArrays(elems[k])
        if (equal(elemsToDelete[k], elems[k])) l.push(k)
      }
    }
  }
  for (let i = 0; i < l.length; i++) {
    delete elems[l[i]]
    delete elemsToDelete[l[i]]
  }
}

/*
Sorts every array into the object using field 'start'
*/
const orderArrays = (o) => {
  for (let p in o) {
    if (o.hasOwnProperty(p)) {
      if (Array.isArray(o[p])) {
        o[p].sort((a, b) => {
          if (a.start) return -1
          else if (b.start) return 1
          else return a.start - b.start
        })
      }
    }
  }
}

/*
Moves records to "done" directories.
*/
const endImport = (path, importType, output, now, ok, partial) => {
  if (fs.existsSync(path)) {
    let newPath = workDir + '/' + (ok ? 'done' : 'error') + '/' +
      importType + (partial ? '_INC_' : '_') + now + '.DWN'
    fs.rename(path, newPath, (err) => { if (err) log.error(err) })
  }
  if (output) {
    output.on('finish', () => {
      try {
        let endPath = remoteDir + '/' + importType + '_' + now + '.LOG'
        let local = workDir + '/' + 'pending' + '/' + importType + (partial ? '_INC_' : '_') + now + '.LOG'
        fs.writeFileSync(endPath, fs.readFileSync(local))
        fs.unlink(local, (err) => { if (err) log.error(err) })
      } catch (exc) { log.error(exc) }
    })
    output.end()
  }
  log.info('End of ' + importType + ' import.')
  notifyEndImport(path, importType, output, now, ok, partial)
  // TODO: Aprofitar el moment per esborrar fitxers antics
}

/*
Puts record r information in the map, respecting
historic data.
*/
const processRecord = (r, yesterday, records, partial, elemsToDelete) => {
  // Avoid past records
  if (r.END !== '' && r.END < yesterday) return
  let record = {id: r.ID}
  if (r.CODE) {
    if (r.CODE === DELETE_MARK) record.code = ''
    else if (r.CODE !== '') record.code = r.CODE
  }
  if (r.NAME && r.NAME !== '') {
    record.name = r.NAME
  }
  if (r.LANGUAGE) {
    if (r.LANGUAGE === DELETE_MARK) record.language = ''
    else record.language = r.LANGUAGE
  }
  if ((r.START && r.START !== '') || (r.END && r.END !== '')) {
    record.validity = [{}]
    if (r.START && r.START !== '') record.validity[0].start = parseInt(r.START)
    if (r.END && r.END !== '') record.validity[0].end = parseInt(r.END)
  } else if (r.START === '' && r.END === '') {
    record.validity = [{}]
  }
  if (r.CARD) {
    if (r.CARD !== '') {
      record.card = [{code: r.CARD}]
      if (record.validity && record.validity[0].start) record.card[0].start = record.validity[0].start
      if (record.validity && record.validity[0].end) record.card[0].end = record.validity[0].end
    }
  }
  if (r.TTGROUP) {
    if (r.TTGROUP !== '') {
      record.timetype_grp = [{code: r.TTGROUP}]
      if (record.validity && record.validity[0].start) record.timetype_grp[0].start = record.validity[0].start
      if (record.validity && record.validity[0].end) record.timetype_grp[0].end = record.validity[0].end
    }
  }

  if (partial) {
    if (r.OPERATION) {
      record.operation = r.OPERATION
      switch (record.operation) {
        case 'P':records.push(record)
          break
        case 'D':elemsToDelete.push(r.ID)
          break
      }
    }
  } else {
    let id = 'ID' + r.ID
    if (records[id]) {
      let first = records[id]
      if (record.validity) {
        if (first.validity) first.validity.push(record.validity[0])
        else first.validity = record.validity
      }
      if (record.card) {
        if (first.card) first.card.push(record.card[0])
        else first.card = record.card
      }
      if (record.timetype_grp) {
        if (first.timetype_grp) first.timetype_grp.push(record.timetype_grp[0])
        else first.timetype_grp = record.timetype_grp
      }
    } else records[id] = record
  }
}

const processTtype = (r, yesterday, ttypes, partial, elemsToDelete) => {
  let ttype
  if (partial) {
    ttype = {code: r.CODE, text: {}, groups: []}
    if (r.OPERATION) {
      ttype.operation = r.OPERATION
      switch (ttype.operation) {
        case 'P':
          let found = false
          for (let i = 0; i < ttypes.length; i++) {
            if (ttypes[i].code === ttype.code) {
              found = true
              ttype = ttypes[i]
            }
          }
          if (!found) ttypes.push(ttype)
          break
        case 'D':elemsToDelete.push(r.CODE)
          break
      }
    }
  } else {
    ttype = ttypes[r.CODE]
    if (!ttype) {
      ttype = {code: r.CODE, text: {}, ttgroup: []}
      ttypes[r.CODE] = ttype
    }
  }
  if (r.LANGUAGE && r.LANGUAGE !== '') ttype.text[r.LANGUAGE] = r.TEXT
  if (r.TTGROUP && r.TTGROUP !== '') {
    if (ttype.groups.indexOf(r.TTGROUP) < 0) ttype.groups.push(r.TTGROUP)
  }
}

const processInfo = (r, yesterday, infos, partial, elemsToDelete) => {
  // ID,INFO,HEADER,TEXT,DATE
  let info = {id: r.ID}
  if (r.INFO && r.INFO !== '') info.name = r.INFO
  if (r.HEADER && r.HEADER !== '') info.value = r.HEADER
  if (r.TEXT && r.TEXT !== '') info.value += ',' + r.TEXT
  if (r.DATE && r.DATE !== '') info.date = r.DATE
  if (infos[info.id] == null) {
    infos[info.id] = info
  } else {
    let info2 = infos[info.id]
    info2.value += ';' + info.value
  }
}

/*
Iterates over records to send them sequenced
*/
const sendOrders = (apiPath, elems, elemsToDelete, output, partial, callback) => {
  if (partial) sendOrder(elems, 0, apiPath, elemsToDelete, output, 0, 0, callback)
  else {
    let l = []
    for (let property in elems) {
      if (elems.hasOwnProperty(property)) l.push(elems[property])
    }
    sendOrder(l, 0, apiPath, elemsToDelete, output, 0, 0, callback)
  }
}

/*
Inserts or updates a Record
*/
const sendOrder = (l, i, apiPath, elemsToDelete, output, nObjects, nErrors, callback) => {
  if (i >= l.length) callback(nObjects, nErrors)
  else {
    let r = l[i]
    let id
    if (apiPath === 'timetypes') id = l[i].code
    else id = l[i].id
    if (elemsToDelete['ID' + id]) delete elemsToDelete['ID' + id]
    // Add item id
    let pos = apiPath.indexOf('@')
    let url = pos < 0 ? apiPath // + '/' + id More general to put id in body
    : apiPath.substring(0, pos) + l[i].id + apiPath.substr(pos + 1)
    log.debug('call ' + url)
    nObjects++
    call('POST', url, r, (err, response, bodyResponse) => {
      if (err) {
        nErrors++
        log.error(err)
        if (output) outPut(output, err.message)
      } else if (response && response.statusCode !== 200 && response.statusCode !== 201) {
        let msg = 'Error ' + response.statusCode + ' : ' + bodyResponse
        log.error(msg)
        if (output) {
          outPut(output, msg)
          outPut(output, url)
          outPut(output, JSON.stringify(r))
        }
        nErrors++
      }
      sendOrder(l, i + 1, apiPath, elemsToDelete, output, nObjects, nErrors, callback)
    })
  }
}

/*
Calls Lemuria API
*/
const call = (method, path, content, callback) => {
  let url = 'http://' + remoteService.host + ':' + remoteService.port + '/api/coms/' + path
  let data = {method: method, url: url}
  // if (headers) data.headers = headers
  data.headers = {'Authorization': 'APIKEY 123'}
  if (content != null) {
    data.json = true
    data.body = content
  }
  request(data, (error, response, body) => callback(error, response, body))
}

/*
Iterates over recordsToDelete to send deletes
*/
const deleteOrders = (apiPath, elemsToDelete, output, partial, callback) => {
  if (elemsToDelete == null) callback()
  else {
    let l = []
    if (partial) l = elemsToDelete
    else {
      for (let property in elemsToDelete) {
        if (elemsToDelete.hasOwnProperty(property)) {
          // It has de form IDnumber
          l.push(property.substring(2))
        }
      }
    }
    deleteOrder(l, 0, apiPath, output, callback)
  }
}

/*
Sends a delete order
*/
const deleteOrder = (l, i, apiPath, output, callback) => {
  if (i >= l.length) callback()
  else {
    log.debug('delete entity with code ' + l[i])

    // Add item id
    let pos = apiPath.indexOf('@')
    let url = pos < 0 ? apiPath + '/' + l[i]
    : apiPath.substring(0, pos) + l[i] + apiPath.substr(pos + 1)

    call('DELETE', url, null, (err) => {
      if (err) {
        log.error(err)
        if (output) outPut(output, err)
      }
      deleteOrder(l, i + 1, apiPath, output, callback)
    })
  }
}

const notifyEndImport = (path, importType, output, now, ok, partial) => {
  log.debug('notifyEndImport: ' + path + '  ' + importType + '  ' + ok)
  g.getEventEmitter().emit(g.EVT.onEndImport, {path, importType, ok})
}

module.exports = {
  init: init
}

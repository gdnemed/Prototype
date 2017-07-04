// -------------------------------------------------------------------------------------------
// Service for files exchange. Allows an external application
// to send and receive data in files, instead of calling API.
// -------------------------------------------------------------------------------------------

const fs = require('fs')
const moment = require('moment-timezone')
const chokidar = require('chokidar')
const csvtojson = require('csvtojson')
const request = require('request')
const logger = require.main.require('./utils/log').getLogger('files')

let ONE_DAY = 86400000

let remoteDir
let workDir
let timeZone
let remoteService
let createOutput

/*
Initialize variables and watching import files.
*/
const init = (params) => {
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
    .on('add', path => moveImportFile(path, importType, fJson, pathGet, pathPost, pathDelete))
}

/*
Renames the original file to DWT, brings it to working directory,
deletes the original file, and begins import process.
*/
const moveImportFile = (path, importType, fJson, pathGet, pathPost, pathDelete) => {
  logger.debug(path)
  if (fs.existsSync(path)) {
    let newPath = path.substring(0, path.length - 1) + 'T'
    fs.rename(path, newPath, (err) => {
      if (err) logger.error(err)
      else {
        let endPath = workDir + '/' + 'pending' + '/' + importType + '.DWT'
        try {
          fs.writeFileSync(endPath, fs.readFileSync(newPath))
          fs.unlink(newPath, (err) => { if (err) logger.error(err) })
          let now = moment.tz(new Date().getTime(), timeZone).format('YYYYMMDDHHmmss')
          if (createOutput) {
            let logPath = workDir + '/' + 'pending' + '/' + importType + '_' + now + '.LOG'
            let output = fs.createWriteStream(logPath)
            output.once('open', () => importPrepare(endPath, importType, fJson, pathGet, pathPost, pathDelete, output, now))
          } else importPrepare(endPath, importType, fJson, pathGet, pathPost, pathDelete, null, now)
        } catch (err) { logger.error(err) }
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
const importPrepare = (path, importType, fJson, pathGet, pathPost, pathDelete, output, now) => {
  logger.info('Start of ' + importType + ' import')
  if (output) outPut(output, 'Start')
  let errMsg
  call('GET', pathGet, null, (err, response, bodyResponse) => {
    if (err) {
      logger.debug(err)
      errMsg = err.message
    } else if (response && response.statusCode !== 200 && response.statusCode !== 201) {
      errMsg = 'Error ' + response.statusCode + ' : ' + bodyResponse
      logger.debug(errMsg)
    } else {
      // Create Map from server response
      let elemsToDelete = {}
      let d = JSON.parse(bodyResponse)
      for (let i = 0; i < d.length; i++) {
        if (importType === 'TTYPES') elemsToDelete['ID' + d[i].code] = d[i]
        else elemsToDelete['ID' + d[i].id] = d[i]
      }
      logger.trace('elemsToDelete')
      logger.trace(elemsToDelete)
      importProcess(elemsToDelete, path, importType, fJson, pathPost, pathDelete, output, now)
    }

    if (errMsg) {
      if (output) outPut(output, errMsg)
      endImport(path, importType, output, now, false)
    }
  })
}

/*
Converts CSV file to a map or objects,
and calls fJson() for each json.
Then calls
to import it.
*/
const importProcess = (elemsToDelete, path, importType, fJson, pathPost, pathDelete, output, now) => {
  let elems = {}
  let yesterday = moment.tz(new Date().getTime() - ONE_DAY, timeZone).format('YYYYMMDD')
  csvtojson().fromFile(path)
  .on('json', (jsonObj) => fJson(jsonObj, yesterday, elems))
  .on('done', (err) => {
    if (err) {
      logger.error(err)
      endImport(path, importType, output, now, false)
    } else {
      sendOrders(pathPost, elems, elemsToDelete, output, (nObjects, nErrors) => {
        if (output) outPut(output, nObjects + ' lines processed. ' + nErrors + ' errors.')
        deleteOrders(pathDelete, elemsToDelete, output,
          () => endImport(path, importType, output, now, true))
      })
    }
  })
}

/*
Moves records to "done" directories.
*/
const endImport = (path, importType, output, now, ok) => {
  if (fs.existsSync(path)) {
    let newPath = workDir + '/' + (ok ? 'done' : 'error') + '/' +
      importType + '_' + now + '.DWN'
    fs.rename(path, newPath, (err) => { if (err) logger.error(err) })
  }
  if (output) {
    output.on('finish', () => {
      try {
        let endPath = remoteDir + '/' + importType + '_' + now + '.LOG'
        let local = workDir + '/' + 'pending' + '/' + importType + '_' + now + '.LOG'
        fs.writeFileSync(endPath, fs.readFileSync(local))
        fs.unlink(local, (err) => { if (err) logger.error(err) })
      } catch (exc) { logger.error(exc) }
    })
    output.end()
  }
  logger.info('End of ' + importType + ' import.')
  // TODO: Aprofitar el moment per esborrar fitxers antics
}

/*
Puts record r information in the map, respecting
historic data.
*/
const processRecord = (r, yesterday, records) => {
  // Avoid past records
  if (r.END !== '' && r.END < yesterday) return
  let record = {id: r.ID}
  if (r.CODE && r.CODE !== '') record.code = r.CODE
  if (r.NAME && r.NAME !== '') record.name = r.NAME
  if (r.LANGUAGE && r.LANGUAGE !== '') record.language = r.LANGUAGE
  if ((r.START && r.START !== '') || (r.END && r.END !== '')) {
    record.validity = [{}]
    if (r.START && r.START !== '') record.validity[0].start = r.START + '000000'
    if (r.END && r.END !== '') record.validity[0].end = r.END + '235959'
  }
  if (r.CARD) {
    record.card = [{code: r.CARD}]
    if (record.validity && record.validity.start) record.card[0].start = record.validity[0].start
    if (record.validity && record.validity.end) record.card[0].end = record.validity[0].end
  }
  if (r.TTGROUP) {
    record.timetype_grp = [{code: r.TTGROUP}]
    if (record.validity && record.validity.start) record.ttgroup[0].start = record.validity[0].start
    if (record.validity && record.validity.end) record.ttgroup[0].end = record.validity[0].end
  }

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
    if (record.ttgroup) {
      if (first.ttgroup) first.ttgroup.push(record.ttgroup[0])
      else first.ttgroup = record.ttgroup
    }
    if (record.validity) {
      if (first.validity) first.validity.push(record.ttgroup[0])
      else first.validity = record.validity
    }
  } else records[id] = record
}

const processTtype = (r, yesterday, ttypes) => {
  let ttype = {code: r.CODE}
  if (r.NAME && r.NAME !== '') ttype.name = r.NAME
  if (r.LANGUAGE && r.LANGUAGE !== '') ttype.language = r.LANGUAGE
  if (r.TTGROUP && r.TTGROUP !== '') ttype.ttgroup = [ r.TTGROUP ]
  ttypes[ttype.code + ttype.language + ttype.ttgroup] = ttype
}

const processInfo = (r, yesterday, infos) => {
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
const sendOrders = (apiPath, elems, elemsToDelete, output, callback) => {
  let l = []
  for (let property in elems) {
    if (elems.hasOwnProperty(property)) l.push(elems[property])
  }
  sendOrder(l, 0, apiPath, elemsToDelete, output, 0, 0, callback)
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
    let url = pos < 0 ? apiPath + '/' + id
    : apiPath.substring(0, pos) + l[i].id + apiPath.substr(pos + 1)
    logger.debug('call ' + url)
    nObjects++
    call('POST', url, r, (err, response, bodyResponse) => {
      if (err) {
        nErrors++
        logger.debug(err)
        if (output) outPut(output, err.message)
      } else if (response && response.statusCode !== 200 && response.statusCode !== 201) {
        let msg = 'Error ' + response.statusCode + ' : ' + bodyResponse
        logger.debug(msg)
        if (output) outPut(output, msg)
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
  if (content != null) {
    data.json = true
    data.body = content
  }
  request(data, (error, response, body) => callback(error, response, body))
}

/*
Iterates over recordsToDelete to send deletes
*/
const deleteOrders = (apiPath, elemsToDelete, output, callback) => {
  let l = []
  for (let property in elemsToDelete) {
    if (elemsToDelete.hasOwnProperty(property)) {
      // It has de form IDnumber
      l.push(property.substring(2))
    }
  }
  deleteOrder(l, 0, apiPath, output, callback)
}

/*
Sends a delete order
*/
const deleteOrder = (l, i, apiPath, output, callback) => {
  if (i >= l.length) callback()
  else {
    logger.debug('delete record ' + l[i])

    // Add item id
    let pos = apiPath.indexOf('@')
    let url = pos < 0 ? apiPath + '/' + l[i].id
    : apiPath.substring(0, pos) + l[i].id + apiPath.substr(pos + 1)

    call('DELETE', url, l[i], (err) => {
      if (err) {
        logger.debug(err)
        if (output) output.print(err)
      }
      deleteOrder(l, i + 1, apiPath, output, callback)
    })
  }
}

module.exports = {
  init: init
}

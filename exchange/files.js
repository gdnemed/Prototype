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

let remoteDir
let workDir
let timeZone
let remoteService

/*
Initialize variables and watching import files.
*/
const init = (params) => {
  remoteService = params.server
  timeZone = 'Europe/Madrid'
  remoteDir = params.dir
  workDir = params.workdir
  watch('RECORDS', processRecord, 'records', 'records')
  watch('TTYPES', processTtype, 'timetypes', 'timetypes')
  watch('INFO', processTtype, 'records/@/info', 'records/@/info')
}

/*
Watches over an import file
*/
const watch = (importType, fJson, pathPost, pathDelete) => {
  chokidar.watch(remoteDir + '/' + importType + '.DWN', {ignored: /(^|[/\\])\../})
    .on('add', path => moveImportFile(path, importType, fJson, pathPost, pathDelete))
}

/*
Renames the original file to DWT, brings it to working directory,
deletes the original file, and begins import process.
*/
const moveImportFile = (path, importType, fJson, pathPost, pathDelete) => {
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
          let output
          importProcess(endPath, importType, fJson, pathPost, pathDelete, output)
        } catch (err) { logger.error(err) }
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
const importProcess = (path, importType, fJson, pathPost, pathDelete, output) => {
  logger.info('Start of ' + importType + ' import')
  // TODO: Substract 1 day
  let yesterday = moment.tz(new Date().getTime(), timeZone).format('YYYYMMDD')
  let elemsToDelete = {}
  let elems = {}
  csvtojson().fromFile(path)
  .on('json', (jsonObj) => fJson(jsonObj, yesterday, elems))
  .on('done', (err) => {
    if (err) {
      logger.error(err)
      endImport(path, importType, output, false)
    } else {
      sendOrders(pathPost, elems, elemsToDelete, output, () => {
        deleteOrders(pathDelete, elemsToDelete, output, () => endImport(path, importType, output, true))
      })
    }
  })
}

/*
Moves records to "done" directories.
*/
const endImport = (path, importType, output, ok) => {
  if (fs.existsSync(path)) {
    let oneDay = 86400000
    let now = moment.tz(new Date().getTime() - oneDay, timeZone).format('YYYYMMDDHHmmss')
    let newPath = workDir + '/' + (ok ? 'done' : 'error') + '/' +
      importType + '_' + now + '.DWN'
    fs.rename(path, newPath, (err) => { if (err) logger.error(err) })
  }
  logger.info('End of ' + importType + ' import.')
}

/*
Puts record r information in the map, respecting
historic data.
*/
const processRecord = (r, yesterday, records) => {
  // Avoid past records
  if (r.END !== '' && r.END < yesterday) return
  let record = {
    id: r.ID,
    code: r.CODE,
    name: r.NAME
  }
  if (r.LANGUAGE) record.language = r.LANGUAGE
  if (r.START !== '' || r.END !== '') {
    record.validity = [{}]
    if (r.START !== '') record.validity[0].start = r.START + '000000'
    if (r.END !== '') record.validity[0].end = r.END + '235959'
  }
  if (r.CARD) {
    record.card = [{code: r.CARD}]
    if (record.validity && record.validity.start) record.card[0].start = record.validity[0].start
    if (record.validity && record.validity.end) record.card[0].end = record.validityv.end
  }
  if (r.TTGROUP) {
    record.timetype_grp = [{code: r.TTGROUP}]
    if (record.validity && record.validity.start) record.ttgroup[0].start = record.validityv.start
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
}

const processInfo = (r, yesterday, infos) => {
}

/*
Iterates over records to send them sequenced
*/
const sendOrders = (apiPath, elems, elemsToDelete, output, callback) => {
  let l = []
  for (let property in elems) {
    if (elems.hasOwnProperty(property)) l.push(elems[property])
  }
  sendOrder(l, 0, apiPath, elemsToDelete, output, callback)
}

/*
Inserts or updates a Record
*/
const sendOrder = (l, i, apiPath, elemsToDelete, output, callback) => {
  if (i >= l.length) callback()
  else {
    let r = l[i]
    if (elemsToDelete['ID' + l[i].id]) delete elemsToDelete['ID' + l[i].id]
    // Add item id
    let pos = apiPath.indexOf('@')
    let url = pos < 0 ? apiPath + '/' + l[i].id
    : apiPath.substring(0, pos) + l[i].id + apiPath.substr(pos + 1)
    logger.debug('call ' + url)
    call('POST', url, r, (err, response, bodyResponse) => {
      if (err) {
        logger.debug(err)
        if (output) output.print(err)
      } else if (response && response.statusCode !== 200 && response.statusCode !== 201) {
        logger.debug('Error ' + response.statusCode + ' : ' + bodyResponse)
      }
      sendOrder(l, i + 1, apiPath, elemsToDelete, output, callback)
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

// -------------------------------------------------------------------------------------------
// Service for files exchange. Allows an external application
// to send and receive data in files, instead of calling API.
// -------------------------------------------------------------------------------------------

const fs = require('fs')
const moment = require('moment-timezone')
const chokidar = require('chokidar')
const csvtojson = require('csvtojson')
const logger = require.main.require('./utils/log').getLogger('files')

let remoteDir
let workDir
let server
let timeZone

/*
Initialize variables and keep watching import files.
*/
const init = (params) => {
  timeZone = 'Europe/Madrid'
  remoteDir = params.dir
  workDir = params.workdir
  chokidar.watch(remoteDir + '/' + 'RECORDS.DWN',
    {ignored: /(^|[/\\])\../})
    .on('add', path => moveRecordFile(path))
}

/*
Renames the original file to DWT, brings it to working directory,
deletes the original file, and begins import process.
*/
const moveRecordFile = (path) => {
  logger.debug(path)
  let newPath = path.substring(0, path.length - 1) + 'T'
  fs.rename(path, newPath, (err) => {
    if (err) logger.error(err)
    else {
      let endPath = workDir + '/' + 'pending' + '/' + 'RECORDS.DWT'
      try {
        fs.writeFileSync(endPath, fs.readFileSync(newPath))
        fs.unlink(newPath, (err) => { if (err) logger.error(err) })
        let output
        importRecords(endPath, output)
      } catch (err) { logger.error(err) }
    }
  })
}

/*
Converts CSV file to a map or objects,
and calls sendRecordsOrders()
to import it.
*/
const importRecords = (path, output) => {
  logger.info('Start of records import')
  // TODO: Substract 1 day
  let yesterday = moment.tz(new Date().getTime(), timeZone).format('YYYYMMDD')
  let recordsToDelete = {}
  let records = {}
  csvtojson().fromFile(path)
  .on('json', (jsonObj) => processRecord(jsonObj, yesterday, records))
  .on('done', (err) => {
    if (err) {
      logger.error(err)
      endRecordsImport(path, false)
    } else {
      sendRecords(records, recordsToDelete, output, () => {
        deleteRecords(recordsToDelete, output, () => endRecordsImport(path, output, true))
      })
    }
  })
}

/*
Moves records to "done" directories.
*/
const endRecordsImport = (path, output, ok) => {
  let now = moment.tz(new Date().getTime(), timeZone).format('YYYYMMDDHHmmss')
  let newPath = workDir + '/' + (ok ? 'done' : 'error') + '/' +
    'RECORDS_' + now + '.DWN'
  fs.rename(path, newPath, (err) => { if (err) logger.error(err) })
  logger.info('End of records import.')
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
    name: r.NAME,
    validity: [r.START, r.END]
  }
  if (r.LANGUAGE) record.language = r.LANGUAGE
  if (r.CARD) {
    record.card = [{code: r.CARD}]
    if (r.START) record.card[0].start = r.START
    if (r.END) record.card[0].end = r.END
  }
  if (r.TTGROUP) {
    record.ttgroup = [{code: r.TTGROUP}]
    if (r.START) record.ttgroup[0].start = r.START
    if (r.END) record.ttgroup[0].end = r.END
  }
  if (r.START || r.END) {
    record.validity = {}
    if (r.START) record.validity.start = r.START
    if (r.END) record.validity.end = r.END
  }

  let id = 'ID' + r.ID
  if (records[id]) {
    let first = records[id]
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

/*
Iterates over records to send them sequenced
*/
const sendRecords = (records, recordsToDelete, output, callback) => {
  let l = []
  for (let property in records) {
    if (records.hasOwnProperty(property)) l.push(records[property])
  }
  sendRecord(l, 0, recordsToDelete, output, callback)
}

/*
Inserts or updates a Record
*/
const sendRecord = (l, i, recordsToDelete, output, callback) => {
  if (i >= l.length) callback()
  let r = l[i]
  if (recordsToDelete['ID' + l.id]) delete recordsToDelete['ID' + l.id]
  // TODO:Call API
  call('POST', '/api/coms/records', r, (err) => {
    if (err) {
      logger.debug(err)
      if (output) output.print(err)
    }
    sendRecord(l, i + 1, recordsToDelete, output, callback)
  })
}

/*
Calls Lemuria API
*/
const call = (order, path, body, callback) => {
}

/*
Iterates over recordsToDelete to send deletes
*/
const deleteRecords = (recordsToDelete, output, callback) => {
  let l = []
  for (let property in recordsToDelete) {
    if (recordsToDelete.hasOwnProperty(property)) {
      // It has de form IDnumber
      l.push(property.substring(2))
    }
  }
  deleteRecord(l, 0, output, callback)
}

/*
Sends a delete order
*/
const deleteRecord = (l, i, output, callback) => {
  if (i >= l.length) callback()
  else {
    logger.debug('delete record ' + l[i])
    // TODO: Call API
    deleteRecord(l, i + 1, callback)
  }
}

module.exports = {
  init: init
}

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
        importRecords(endPath)
      } catch (err) { logger.error(err) }
    }
  })
}

/*
Converts CSV file to a map or objects,
and calls sendRecordsOrders()
to import it.
*/
const importRecords = (path) => {
  logger.info('Start of records import')
  let today = moment.tz(new Date().getTime(), timeZone).format('YYYYMMDD')
  let recordsToDelete = {}
  csvtojson().fromFile(path)
  .on('json', (jsonObj) => processRecord(jsonObj, today, recordsToDelete))
  .on('done', (err) => {
    if (err) {
      logger.error(err)
      endRecordsImport(path, false)
    } else {
      deleteRecords(recordsToDelete, (err) => {
        if (err) logger.error(err)
        endRecordsImport(path, true)
      })
    }
  })
}

/*
Moves records to "done" directories.
*/
const endRecordsImport = (path, ok) => {
  let now = moment.tz(new Date().getTime(), timeZone).format('YYYYMMDDHHmmss')
  let newPath = workDir + '/' + (ok ? 'done' : 'error') + '/' +
    'RECORDS_' + now + '.DWN'
  fs.rename(path, newPath, (err) => { if (err) logger.error(err) })
  logger.info('End of records import.')
}

/*
Puts record r information in maps, respecting
historic data.
*/
const processRecord = (r, today, recordsToDelete) => {
  // Avoid past records
  if (r.END !== '' && r.END < today) return
  let record = {
    code: r.ID,
    name: r.NAME,
    language: r.LANGUAGE,
    ttgroup: r.TTGROUP,
    validity: [r.START, r.END]
  }
  let id = 'ID' + r.ID
  if (recordsToDelete[id]) delete recordsToDelete[id]
  // TODO: Call API
  logger.debug(record)
  // Now, cards ...
}

const deleteRecords = (recordsToDelete, callback) => {
  let l = []
  for (let property in recordsToDelete) {
    if (recordsToDelete.hasOwnProperty(property)) {
      // It has de form IDnumber
      l.push(property.substring(2))
    }
  }
  deleteRecord(l, 0, callback)
}

const deleteRecord = (l, i, callback) => {
  if (i >= l.length) callback()
  else {
    logger.debug('delete record ' + l[i])
    deleteRecord(l, i + 1, callback)
  }
}

module.exports = {
  init: init
}

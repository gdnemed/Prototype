// -------------------------------------------------------------------------------------------
// Service for clockings export. Calls Lemuria API and puts them into a text file.
// -------------------------------------------------------------------------------------------

var os = require('os')
var path = require('path')
var json2csv = require('json2csv')
const fs = require('fs')
const request = require('request')
const logger = require('../utils/log')
const utils = require('../utils/utils')
const g = require('../global')
const EventSource = require('eventsource')

let log
let remoteDir
let remoteService
let apiKey
let currentId = 0
let period
let fileName
let hasHeaders
let headers = ['id', 'record', 'card', 'date', 'time', 'dir', 'ttype', 'result', 'clockpoint']

const init = () => {
  let exc = g.getConfig().exchange
  if (!exc) return Promise.resolve()
  else {
    let params = exc.clockings
    if (!params) return Promise.resolve()
    else {
      log = logger.getLogger('clockings')
      log.debug('>> clockings.init()')

      remoteService = params.server
      remoteDir = params.dir
      fileName = params.fileName
      hasHeaders = params.headers
      apiKey = '123'
      period = params.period !== undefined ? 60000 * params.period : 60000
      if (period === 0) { // As soon as possible
        var eventSourceInitDict = {headers: {'Authorization': 'APIKEY ' + apiKey}}
        let eventSource = new EventSource('http://' + remoteService.host + ':' + remoteService.port + '/api/coms/asap', eventSourceInitDict)
        eventSource.addEventListener('clocking', (e) => {
          writeClockings([JSON.parse(e.data)])
          log.trace(e.data)
        })
      } else { // Periodic
        fs.readFile('./counter', 'utf8', (err, contents) => {
          if (err && (err.code !== 'ENOENT')) log.error(err)
          else {
            if (contents) currentId = parseInt(contents)
            setTimeout(periodicRoutine, 0)
          }
        })
      }
      return Promise.resolve()
    }
  }
}

const periodicRoutine = () => {
  call((error, response, body) => {
    if (error) log.error(error)
    else {
      if (response && response.statusCode === 200) {
        let json = JSON.parse(body)
        if (json.length > 0) {
          currentId = json[json.length - 1].id
          // Save current counter
          let output = fs.createWriteStream('./counter')
          output.once('open', () => {
            output.write('' + currentId)
            output.close()
          })
          writeClockings(json)
        }
      } else log.error('Error in API call: ' + response.statusCode + ': ' + response.body)
    }
    setTimeout(periodicRoutine, period)
  })
}

const writeClockings = (json) => {
  for (let i = 0; i < json.length; i++) {
    if (!json[i].dir) json[i].dir = 'N'
    if (!json[i].ttype) json[i].ttype = 0
    if (!json[i].clockpoint) json[i].clockpoint = 0
  }
  let filepath = path.join(remoteDir, fileName? fileName : ('clk' + utils.now() + '.csv'))
  fs.stat(filepath, function (err, stat) {
    let hasCSVColumnTitle = false;
    if (err != null) {
      //if file don't exists write headers when is configured
      if (err.code !== 'ENOENT')
        throw err
      hasCSVColumnTitle = hasHeaders;
    }
    //append csv row
    var csv = json2csv({data: json, fields: headers, hasCSVColumnTitle: hasCSVColumnTitle})
    fs.appendFile(filepath, csv + (os.EOL || '\n'), function (err) {
      if (err)
        throw err;
    });
  });
}

/*
Calls Lemuria API
*/
const call = (callback) => {
  let url = 'http://' + remoteService.host + ':' + remoteService.port + '/api/coms/clockings?fromid=' + currentId
  let data = {method: 'GET', url: url}
  // if (headers) data.headers = headers
  data.headers = {'Authorization': 'APIKEY ' + apiKey}
  request(data, (error, response, body) => callback(error, response, body))
}

module.exports = {
  init
}

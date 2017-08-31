// -------------------------------------------------------------------------------------------
// Service for clockings export. Calls Lemuria API and puts them into a text file.
// -------------------------------------------------------------------------------------------

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
      apiKey = '123'
      period = params.period !== undefined ? 60000 * params.period : 60000
      if (period === 0) { // As soon as possible
        var eventSourceInitDict = {headers: {'Authorization': 'APIKEY ' + apiKey}};
        let eventSource = new EventSource('http://' + remoteService.host + ':' + remoteService.port + '/api/coms/asap', eventSourceInitDict)
        eventSource.addEventListener('clocking', (e) => {
          writeClockings([e.data])
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
          for (let i = 0; i < json.length; i++) {
            if (!json[i].dir) json[i].dir = 'N'
            if (!json[i].ttype) json[i].ttype = 0
            if (!json[i].clockpoint) json[i].clockpoint = 0
          }
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
  var csv = json2csv({data: json, fields: headers})
  if (period === 0) {
    let path = remoteDir + '/clk.csv'
    let stream = fs.crateWriteStream(path, {
      flags: 'w+',
      defaultEncoding: 'utf8',
      mode: 0o666,
      autoClose: true
    })
    stream.write(csv)
    stream.close()
  } else {
    let path = remoteDir + '/clk' + utils.now() + '.csv'
    fs.writeFile(path, csv, (err) => {
      if (err) log.error(err)
      else log.info('clockings file saved')
    })
  }
}



/*
Calls Lemuria API
*/
const call = (callback) => {
  let url = 'http://' + remoteService.host + ':' + remoteService.port +
    '/api/coms/clockings?fromid=' + currentId
  let data = {method: 'GET', url: url}
  // if (headers) data.headers = headers
  data.headers = {'Authorization': 'APIKEY ' + apiKey}
  request(data, (error, response, body) => callback(error, response, body))
}

module.exports = {
  init: init
}

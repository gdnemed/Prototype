// -------------------------------------------------------------------------------------------
// Service for clockings export. Calls Lemuria API and puts them into a text file.
// -------------------------------------------------------------------------------------------

var json2csv = require('json2csv')
const fs = require('fs')
const request = require('request')
const logger = require('../utils/log')
const utils = require('../utils/utils')
const g = require('../global')

let log
let remoteDir
let remoteService
let currentId = 0
let period
let headers = ['tmp', 'result', 'card', 'record']

const init = () => {
  log = logger.getLogger('clockings')
  log.debug('>> clockings.init()')
  let params = g.getConfig().exchange.clockings
  remoteService = params.server
  remoteDir = params.dir
  period = params.period && params.period > 0 ? 60000 * params.period : 60000
  // TODO: restore currentId
  setTimeout(periodicRoutine, period)
  return Promise.resolve()
}

const periodicRoutine = () => {
  call((error, response, body) => {
    if (error) log.error(error)
    else {
      if (response && response.statusCode === 200) {
        let json = JSON.parse(body)
        if (body.length > 0) {
          currentId = json[json.length - 1].id
          // TODO: save currentId
          var csv = json2csv({data: json, fields: headers})
          let path = remoteDir + '/clk' + utils.now() + '.csv'
          fs.writeFile(path, csv, (err) => {
            if (err) log.error(err)
            else log.info('clockings file saved')
          })
        }
      } else log.error('Error in API call: ' + response.statusCode)
    }
    setTimeout(periodicRoutine, period)
  })
}

/*
Calls Lemuria API
*/
const call = (callback) => {
  let url = 'http://' + remoteService.host + ':' + remoteService.port +
    '/api/coms/clockings?fromid=' + currentId
  let data = {method: 'GET', url: url}
  // if (headers) data.headers = headers
  data.headers = {'Authorization': 'APIKEY 123'}
  request(data, (error, response, body) => callback(error, response, body))
}

module.exports = {
  init: init
}

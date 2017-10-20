/* global process, require, module */
// -------------------------------------------------------------------------------------------
// httpServer
// - holds all objects to manage API REST
// - configures Express
// -------------------------------------------------------------------------------------------

const express = require('express')
const bodyParser = require('body-parser')
const logger = require('./utils/log')
const g = require('./global')

let _api
let lg

const init = () => {
  let port = g.getConfig().apiPort
  if (port) {
    lg = logger.getLogger('httpServer')
    lg.debug('>> httpServer: init()')
    return new Promise((resolve, reject) => {
      _api = express()
      _api.use(bodyParser.json())
      // Uncomment if enabling CORS is required
      // _api.use((req, res, next) => {
      //  res.header('Access-Control-Allow-Origin', '*')
      //  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
      //  next()
      // })

      // Run http server
      let httpServer = _api.listen(port, (err) => {
        if (err) reject(err)
        else {
          let address = httpServer.address()
          lg.info('API listening at port ' + address.port)
          // Every node should be checked
          _api.get('/api/registry/check', (req, res) => responseCheckTest(req, res))
          resolve()
        }
      })
    })
  } else return Promise.resolve()
}

// TESTING
// Checking heartbeat testing function
const responseCheckTest = (req, res) => {
  let response = {
    'host': '127.0.0.1:8081',
    'service': ['logic', 'com', 'test'],
    'environment': 'dev',
    'address': {
      'protocol': 'http',
      'server': '127.0.0.1',
      'port': '8081'
    },
    'request': {
      'protocol': 'http',
      'server': '127.0.0.1',
      'port': '8081'
    },
    'version': '1.1',
    'time': '',
    'load': '75'
  }

  // res.jsonp(response)
  res.jsonp({'service': []})
}

module.exports = {
  init,
  getApi: () => _api
}

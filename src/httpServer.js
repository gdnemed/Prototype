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
const perf = require('./performance')

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
          // Statistics treatment
          _api.use((req, res, next) => {
            let start = Date.now()
            res.on('finish', () => {
              let end = Date.now()
              let t = end - start
              perf.updateStatistics(req.url, end, t)
            })
            next()
          })
          // Every node should be checked
          _api.get('/api/registry/check', (req, res) => res.jsonp(perf.getStatistics()))
          resolve()
        }
      })
    })
  } else return Promise.resolve()
}

module.exports = {
  init,
  getApi: () => _api
}

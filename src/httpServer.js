/* global process, require, module */
// -------------------------------------------------------------------------------------------
// httpServer
// - holds all objects to manage API REST
// - configures Express
// -------------------------------------------------------------------------------------------

const express = require('express')
const bodyParser = require('body-parser')
const squeries = require('./objects/squeries')
const logger = require('./utils/log')
const g = require('./global')
const sessions = require('./session/sessions')

let _api
let lg

const init = () => {
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
    //})

    // For testing
    _api.post('/api/objects/query', (req, res) => sessions.manageSession(req, res, query))

    // Run http server
    let httpServer = _api.listen(g.getConfig().api_listen.port, (err) => {
      if (err) reject(err)
      else {
        let address = httpServer.address()
        lg.info('API listening at port ' + address.port)
        resolve()
      }
    })
  })
}

const query = (req, res, session) => {
  squeries.get(session, req.params, req.body, (err, ret) => {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(ret)
  })
}

module.exports = {
  init,
  getApi: () => _api
}

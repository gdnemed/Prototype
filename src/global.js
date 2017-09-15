/* global process, require, module */
// -------------------------------------------------------------------------------------------
// global file (holds all global objects required by any module, ex: api, cfg, eventEmitter, dbs, etc)
// -------------------------------------------------------------------------------------------
const request = require('request')
const events = require('events')
const logger = require('./utils/log')
const fs = require('fs')

let log

// -------------------------------------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------------------------------------
let _evtEmitter
// Events names
const EVT = {
  onEndImport: 'onEndImport', // emitted by 'files' when an import process is finished
  onEntityVersionChange: 'onEntityVersionChange' // emitted by 'logi' when an entity version is increased
}
// Creates an instance of 'EventEmitter' that allows emision and reception of events
// via eventEmitter.emit(...) / eventEmitter.on(...)
const initEvents = () => {
  _evtEmitter = new events.EventEmitter()
}

// -------------------------------------------------------------------------------------------
// CONFIGURATION
// -------------------------------------------------------------------------------------------
let _cfg
const initConfiguration = () => {
  return new Promise((resolve, reject) => {
    // If url argument passed, configuration must be get from server
    if (process.argv.indexOf('--url') !== -1) {
      let url = process.argv[process.argv.indexOf('--url') + 1]
      let apiKey
      if (process.argv.indexOf('--apiKey') !== -1) {
        apiKey = process.argv[process.argv.indexOf('--apiKey') + 1]
      }
      getRemoteConfiguration(url, apiKey)
        .then(resolve)
        .catch(reject)
    } else {
      try {
        let home = process.env.HOME
        let routeCfg = home
        log.debug(`Using config file ${routeCfg}`)
        let strConfig = applyEnvVars(fs.readFileSync(routeCfg + '/config.json', 'utf8'))
        _cfg = JSON.parse(strConfig)
        resolve()
      } catch (err) {
        console.log('ERROR: cannot start Lemuria: ' + err.message)
        process.exit()
      }
    }
  })
}

const getRemoteConfiguration = (url, apiKey) => {
  return new Promise((resolve, reject) => {
    let data = {method: 'GET', url: url}
    if (apiKey) data.headers = {'Authorization': 'APIKEY ' + apiKey}
    request(data, (error, response, body) => {
      if (error) reject(error)
      else {
        _cfg = JSON.parse(body)
        // We add remote access parameters, which are useful for future calls
        _cfg.url = url
        _cfg.apiKey = apiKey
        resolve()
      }
    })
  })
}

const applyEnvVars = (str) => {
  const REGEXP_VAR = /\$[A-Za-z_][A-Za-z_0-9]*\$/g
  let getValForKey = (key) => {
    let newVal = process.env[key.replace(/\$/g, '')]
    if (newVal !== undefined) return newVal
    else return key
  }
  str = str.replace(REGEXP_VAR, getValForKey)
  return str
}

const init = () => {
  log = logger.getLogger('global')
  log.debug('>> global.init()')
  return new Promise((resolve, reject) => {
    initConfiguration()
      .then(() => {
        initEvents()
        resolve()
      })
      .catch(reject)
  })
}

module.exports = {
  init,
  // Events names & event emitter
  EVT,
  getEventEmitter: () => _evtEmitter,
  // Config
  getConfig: () => _cfg
}

/* global process, require, module */
// -------------------------------------------------------------------------------------------
// global file (holds all global objects required by any module, ex: api, cfg, eventEmitter, dbs, etc)
// -------------------------------------------------------------------------------------------

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
  log = logger.getLogger('global')
  try {
    let home = process.env.HOME
    let routeCfg = home
    switch (process.env.NODE_ENV) {
      case 'test': routeCfg = `${home}\\test`; break
      case 'stress_test': routeCfg = `${home}\\`; break
    }
    log.debug(`Using config file ${routeCfg}`)
    let strConfig = applyEnvVars(fs.readFileSync(routeCfg + '/config.json', 'utf8'))
    _cfg = JSON.parse(strConfig)
  } catch (err) {
    console.log('config.json not found, using default configuration.')
    process.exit()
  }
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
  console.log('>> global: init()')
  initConfiguration()
  initEvents()
}

module.exports = {
  init,
  // Events names & event emitter
  EVT,
  getEventEmitter: () => _evtEmitter,
  // Config
  getConfig: () => _cfg
}

/* global process, require, module */
// -------------------------------------------------------------------------------------------
// global file (holds all global objects required by any module, ex: api, cfg, eventEmitter, dbs, etc)
// -------------------------------------------------------------------------------------------

const events = require('events')

let _evtEmitter
let _cfg

// Creates an instance of 'EventEmitter' that allows emision and reception of events
// via eventEmitter.emit(...) / eventEmitter.on(...)
const initEvents = () => {
  _evtEmitter = new events.EventEmitter()
}

const init = () => {
  console.log('>> global: init()')
  initEvents()
}

module.exports = {
  init,
  getEventEmitter: () => _evtEmitter

}

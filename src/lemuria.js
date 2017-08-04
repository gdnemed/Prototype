/* global process, require, module */
// -------------------------------------------------------------------------------------------
// Main Lemuria entry point.
// -Installs/uninstalls Lemuria as a service
// -Initialize Lemuria services
// -Starts http server for API calls
// -------------------------------------------------------------------------------------------

const logger = require('./utils/log')
const g = require('./global')
const httpServer = require('./httpServer')
const state = require('./state/state')
const coms = require('./coms/coms')
const files = require('./exchange/files')
const logic = require('./logic')
const scheduler = require('./tasks/scheduler')
const sessions = require('./session/sessions')

let log

const init = () => {
  // logger initialization
  let home = process.cwd()
  logger.configure(home)
  log = logger.getLogger('Main')
  // Initialization of global module (so far, sync). If sometimes becomes async, promise.then() will be needed to use
  g.init()
  return new Promise((resolve, reject) => {
    if (process.argv.length <= 2 || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'stress_test') {
      console.log('Starting lemuria as application')
      // Run it as a program
      sessions.init()
        .then(httpServer.init)
        .then(initServices)
        .then(() => {
          log.info('>> Services started. Application ready...')
          resolve()
        })
        .catch((err) => {
          log.error(`ERROR: cannot start Lemuria: ${err}`)
          reject(err)
        })
    } else {
      console.log('Starting lemuria as a service: ' + process.argv.length)
      // Install/uninstall as a service
      serviceFunctions(process.argv).then(resolve)
    }
  })
}

const initServices = () => {
  return new Promise((resolve, reject) => {
    log.info('initServices')
    logic.init(sessions, state, coms)
      .then(() => coms.init(logic, sessions))
      .then(state.init)
      .then(files.init)
      .then(() => scheduler.init(sessions))
      .then(resolve)
      .catch((error) => {
        reject(new Error(`Error in services initialization: ${error.message}`))
      })
  })
}


/*
Installs/unistalls Lemuria as a Windows service.
args: Command line parameters. args[2] contains i/u for installing/uninstalling.
*/
const serviceFunctions = (args) => {
  let Service = require('node-windows').Service
  return new Promise((resolve, reject) => {
    // Create a new service object
    let svc = new Service({
      name: 'Lemuria',
      description: 'SPEC coms module.',
      script: process.cwd() + '\\lemuria.js'
    })
    // Listen for the "install" events
    svc.on('install', () => {
      console.log('Service installed')
      resolve()
    })
    svc.on('uninstall', () => {
      console.log('Service uninstalled')
      resolve()
    })
    // Execute command
    switch (args[2]) {
      case 'i':
        svc.install()
        break
      case 'u':
        svc.uninstall()
        break
    }
  })
}

module.exports = {
  init
}

// Start Lemuria when not testing (tests start Lemuria by themselves)
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'stress_test') {
  init()
}

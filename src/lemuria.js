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
const clockings = require('./exchange/clockings')
const logic = require('./logic')
const scheduler = require('./tasks/scheduler')
const sessions = require('./session/sessions')
const globalServer = require('./global/globalServer')
const registry = require('./registry/registry')

let log

const invokeLocal = (service, methodName, session, parameters) => {
  return new Promise((resolve, reject) => {
    log.debug('LEMURIA invokeLocal: ' + service + '.' + methodName)
    switch (service) {
      case 'state':
        state[methodName](session, parameters)
          .then(resolve).catch(reject)
        break
      case 'global':
        globalServer[methodName](session, parameters)
          .then(resolve).catch(reject)
        break
      default:
        reject(new Error('Invoked service method does not exists: ' + service + '.' + methodName))
    }
  })
}

const init = (params) => {
  // logger initialization
  log = logger.getLogger('Main')
  return new Promise((resolve, reject) => {
    let startService = process.argv.indexOf('-i') !== -1
    let endService = process.argv.indexOf('-u') !== -1
    if ((!startService && !endService)) {
      console.log('Starting lemuria as application')
      // Initialization of global module (so far, sync). If sometimes becomes async, promise.then() will be needed to use
      g.init(params, invokeLocal)
        .then(httpServer.init)
        .then(globalServer.init)
        .then(registry.init)
        .then(sessions.init)
        .then(initServices)
        .then(g.registerHostedServices)
        .then(g.getServicesRegistry)
        .then(() => {
          g.initJobReloadServicesList()
          log.info('Application ready...')
          resolve()
        })
        .catch((err) => {
          log.error(`ERROR: cannot start Lemuria: `)
          log.error(err)
          reject(err)
        })
    } else {
      console.log('Starting lemuria as a service: ' + process.argv.length)
      // Install/uninstall as a service
      serviceFunctions(startService).then(resolve)
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
      .then(clockings.init)
      .then(() => scheduler.init(sessions))
      .then(resolve)
      .catch((error) => {
        reject(new Error(`Error in services initialization: ${error}`))
      })
  })
}

/*
Installs/unistalls Lemuria as a Windows service.
args: Command line parameters. args[2] contains i/u for installing/uninstalling.
*/
const serviceFunctions = (startService) => {
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
    if (startService) svc.install()
    else svc.uninstall()
  })
}

module.exports = {
  init
}

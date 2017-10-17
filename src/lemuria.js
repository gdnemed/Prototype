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
    let fName
    switch (service) {
      case 'state':
        fName = (methodName === 'settings') ? 'postSettings' : methodName
        resolve(state[fName](session, parameters))
        break
      default:
        reject(new Error('Invoked service method does not exists: ' + service + '.' + methodName))
    }
  })
}

const init = () => {
  // logger initialization
  log = logger.getLogger('Main')
  return new Promise((resolve, reject) => {
    let startService = process.argv.indexOf('-i') !== -1
    let endService = process.argv.indexOf('-u') !== -1
    if ((!startService && !endService) || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'stress_test') {
      console.log('Starting lemuria as application')
      // Initialization of global module (so far, sync). If sometimes becomes async, promise.then() will be needed to use
      g.init(invokeLocal)
        .then(httpServer.init)
        .then(globalServer.init)
        .then(registry.init) // JDS
        .then(sessions.init)
        .then(initServices)
        .then(() => {
          log.info('>> Services started. Application ready...')
          resolve()
        })
        // INIT JDS
        .then(() => {
          log.info('(1) >> Add STATE to REGISTRY...')
          g.hardCodedAddState()
        })
        .then(() => {
          log.info('(2) >> Call REGISTRY...')
          g.callRegistry()
        })
        .then(() => {
          setTimeout(() => {
            log.info('(3) >> Invoke STATE METHOD SETTINGS...')

            sessions.getSession('SPEC')
              .then((mySession) => {
                g.invokeService('state', 'settings', mySession, {'setting1': 'settingValue1', 'setting2': 'settingValue2'})
                  .then((result) => {
                    console.log('(4) >> INVOKED METHOD RESULT === ' + JSON.stringify(result))
                  })
              })
          }, 1500)
        })
        // END JDS
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

// Start Lemuria when not testing (tests start Lemuria by themselves)
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'stress_test') {
  init()
}

/* global process, require, module */
// -------------------------------------------------------------------------------------------
// Main Lemuria entry point.
// -Installs/uninstalls Lemuria as a service
// -Initialize Lemuria services
// -Starts http server for API calls
// -------------------------------------------------------------------------------------------

const express = require('express')
const bodyParser = require('body-parser')
const logger = require('./utils/log')

const g = require('./global')
const state = require('./state/state')
const coms = require('./coms/coms')
const files = require('./exchange/files')
const logic = require('./logic')

const squeries = require('./objects/squeries')
const sessions = require('./session/sessions')

let api, httpServer, log

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
        .then(initApiServer)
        .then(initServices)
        .then(initProcess)
        .then(resolve)
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

const initApiServer = () => {
  return new Promise((resolve, reject) => {
    log.info('initApiServer')
    api = express()
    api.use(bodyParser.json())
    // API functions
    api.post('/api/state/settings', (req, res) => sessions.manageSession(req, res, state.postSettings))
    api.get('/api/state/settings', (req, res) => sessions.manageSession(req, res, state.getSettings))
    // For testing
    api.post('/api/objects/query', (req, res) => sessions.manageSession(req, res, query))
    logic.initAPI(api)
    // Run http server
    httpServer = api.listen(g.getConfig().api_listen.port, (err) => {
      if (err) reject(err)
      else {
        let address = httpServer.address()
        log.info('API listening at port ' + address.port)
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


const initServices = () => {
  return new Promise((resolve, reject) => {
    try {
      log.info('initServices')
      logic.init(sessions, state, coms)
      coms.init(logic, sessions)
      resolve()
    } catch (error) {
      reject(new Error(`Error in services initialization: ${error}`))
    }
  })
}

/*
Starts processes, like importation of files, etc.
*/
const initProcess = () => {
  return new Promise((resolve, reject) => {
    log.info('initProcess')
    if (files.init()) resolve()
    else reject(new Error('initProcess failed'))
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

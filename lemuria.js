/* global process, require, module */
// -------------------------------------------------------------------------------------------
// Main Lemuria entry point.
// -Installs/uninstalls Lemuria as a service
// -Initialize Lemuria services
// -Starts http server for API calls
// -------------------------------------------------------------------------------------------

const express = require('express')
const bodyParser = require('body-parser')

const g = require('./global')
const state = require('./state/state')
const coms = require('./coms/coms')
const files = require('./exchange/files')
const logic = require('./logic')
const logger = require('./utils/log')
const migrations = require('./migrations')
const squeries = require('./objects/squeries')
const sessions = require('./session/sessions')

let api, httpServer, logM, log
let customers = {}

const init = () => {
  // logger initialization
  let home = process.cwd()
  logger.configure(home)
  logM = logger.getLogger('migration')
  log = logger.getLogger('Main')
  // Initialization of global module (so far, sync). If sometimes becomes async, promise.then() will be needed to use
  g.init()
  return new Promise((resolve, reject) => {
    if (process.argv.length <= 2 || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'stress_test') {
      console.log('Starting lemuria as application')
      // Run it as a program
      initializeCustomer(sessions.getCustomers(), 0)
        .then(initApiServer)
        .then(initServices)
        .then(initProcess)
        .then(() => {
          resolve({
            dbs: customers['SPEC'].dbs
          })
        }) // For test, return 1 database
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

const initializeCustomer = (customersList, i) => {
  return new Promise((resolve, reject) => {
    if (i >= customersList.length) resolve()
    else {
      customers[customersList[i].name] = {}
      migrations.init('sqlite', customersList[i].name, '2017')
        .then((knexRefs) => debugTestdbs(knexRefs, customersList[i].name))
        .then(() => initializeCustomer(customersList, i + 1))
        .then(() => resolve())
        .catch(reject)
    }
  })
}

// debug: verifies that each knex object for each db exists
const debugTestdbs = (dbs, customer) => {
  return new Promise((resolve, reject) => {
    log.info('Verifying migration')
    let kState = dbs['state']
    let kObjects = dbs['objects']
    let kInputs = dbs['inputs']
    customers[customer].dbs = dbs
    logM.debug('DB ' + customer)

    kState.select().table('settings')
      .then((collection) => {
        logM.debug('settings len  = ' + collection.length)
        return kObjects.select().table('entity_1')
      })
      .then((collection) => {
        logM.debug('entity_1 len  = ' + collection.length)
        return kInputs.select().table('input_1_201707')
      })
      .then((collection) => {
        logM.debug('input_1_201707 len  = ' + collection.length)
        resolve()
      })
      .catch((err) => {
        console.log('ERROR: ' + err)
        reject(err)
      })
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

const getDatabases = (customer) => {
  return customers[customer].dbs
}

const initServices = () => {
  return new Promise((resolve, reject) => {
    try {
      log.info('initServices')
      sessions.init(customers)
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
  getDatabases,
  init
}

// Start Lemuria when not testing (tests start Lemuria by themselves)
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'stress_test') {
  init()
}

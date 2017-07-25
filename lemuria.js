/* global process, require, module */
// -------------------------------------------------------------------------------------------
// Main Lemuria entry point.
// -Installs/uninstalls Lemuria as a service
// -Initialize Lemuria services
// -Starts http server for API calls
// -------------------------------------------------------------------------------------------
const fs = require('fs')
const express = require('express')
const bodyParser = require('body-parser')

const state = require('./state/state')
const coms = require('./coms/coms')
const files = require('./exchange/files')
const logic = require('./logic')
const logger = require('./utils/log')
const migrations = require('./migrations')
const squeries = require('./objects/squeries')
const sessions = require('./session/sessions')

let home, environment, customers, api, httpServer, logM, log

const init = () => {
  return new Promise((resolve, reject) => {
    if (process.argv.length <= 2 || process.env.NODE_ENV === 'test') {
      console.log('Starting lemuria as application')
      // Run it as a program
      initConfiguration()
      initializeCustomer(sessions.getCustomers(), 0)
        .then(initApiServer)
        .then(initServices)
        .then(initProcess)
        .then(() => {
          resolve(customers['SPEC'].dbs)
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
      migrations.init('sqlite', customersList[i].name, '2017')
        .then((knexRefs) => debugTestKnexRefs(knexRefs))
        .then(() => initializeCustomer(customersList, i + 1))
        .then(() => resolve())
        .catch(reject)
    }
  })
}

const initConfiguration = () => {
  home = process.cwd()
  logger.configure(home)
  logM = logger.getLogger('migration')
  log = logger.getLogger('Main')
  try {
    let routeCfg = process.env.NODE_ENV === 'test' ? `${home}\\test` : home
    log.debug(`Using config file ${routeCfg}`)
    environment = JSON.parse(fs.readFileSync(routeCfg + '/config.json', 'utf8'))
  } catch (err) {
    log.info('config.json not found, using default configuration.')
    environment = {
      'api_listen': {'host': '', 'port': 8081},
      'coms_listen': {'host': '', 'port': 8092},
      'node_id': 1,
      'exchange': {
        'files': {
          'dir': '.',
          'workdir': '.',
          'server': {'host': '', 'port': 8081}
        }
      }
    }
  }
  // it will be: customers = {SPEC: {}}
  customers = {SPEC: {}}
}

// debug: verifies that each knex object for each db exists
const debugTestKnexRefs = (knexRefs) => {
  return new Promise((resolve, reject) => {
    log.info('Verifying migration')
    let kState = knexRefs['state']
    let kObjects = knexRefs['objects']
    let kInputs = knexRefs['inputs']

    customers['SPEC'].dbs = knexRefs

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
    httpServer = api.listen(environment.api_listen.port, (err) => {
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
      coms.init(environment.coms_listen, logic)
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
    if (files.init(environment.exchange.files)) resolve()
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

const getEnvironment = () => environment

module.exports = {
  getDatabases,
  getEnvironment,
  init
}

// Start Lemuria when not testing (tests start Lemuria by themselves)
if (process.env.NODE_ENV !== 'test') {
  init()
}

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
const moment = require('moment-timezone')

const state = require('./state/state')
const coms = require('./coms/coms')
const files = require('./exchange/files')
const logic = require('./logic')
const logger = require('./utils/log')
const migrations = require('./migrations')

let home, environment, customers, api, httpServer, logM, log

const init = () => {
  // Install/uninstall as a service
  if (process.argv.length > 2) serviceFunctions(process.argv)
  else {
    // Run it as a program
    initConfiguration()
    migrations.init('sqlite', 'SPEC', '2017').then((knexRefs) => {
      debugTestKnexRefs(knexRefs)
        .then(initApiServer())
        .then(initServices())
        .then(initProcess())
        .catch((err) => {
          log.error(`ERROR: cannot start Lemuria: ${err}`)
        })
    }).catch((err) => logM.error(`ERROR: Migration failed: ${err}`))
  }
}

const initConfiguration = () => {
  home = process.cwd()
  logger.configure(home)
  logM = logger.getLogger('migration')
  log = logger.getLogger('Main')
  try {
    environment = JSON.parse(fs.readFileSync(home + '/config.json', 'utf8'))
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

    // testing knex ojbect that holds 'state' db
    kState.select().table('settings')
      .then((collection) => logM.debug('settings len  = ' + collection.length))
      .catch((err) => logM.error('ERROR: in GET settings : ' + err))

    // testing knex ojbect that holds 'objects' db
    kObjects.select().table('entity_1')
      .then((collection) => logM.debug('entity_1 len  = ' + collection.length))
      .catch((err) => logM.error('ERROR: in GET entity_1 : ' + err))

    // testing knex ojbect that holds 'inputs' db
    kInputs.select().table('input_1_201707')
      .then((collection) => logM.debug('input_1_201707 len  = ' + collection.length))
      .catch((err) => logM.error('ERROR: in GET input_1_201707 : ' + err))

    resolve()
  })
}

function initApiServer () {
  return new Promise((resolve, reject) => {
    log.info('initApiServer')
    api = express()
    api.use(bodyParser.json())
    // API functions
    api.post('/api/state/settings', (req, res) => manageSession(req, res, state.postSettings))
    api.get('/api/state/settings', (req, res) => manageSession(req, res, state.getSettings))
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

/*
Initialize session object for this API call, an executes f
*/
const manageSession = (req, res, f) => {
  let customer = 'SPEC'
  let ts = new Date().getTime()
  let now = moment.tz(ts, 'GMT').format('YYYYMMDDHHmmss')
  let session = {
    name: customer,
    dbs: customers[customer].dbs,
    now: parseInt(now),
    today: parseInt(now.substring(0, 8))}
  f(req, res, session)
}

const getDatabases = (customer) => {
  return customers[customer].dbs
}

const initServices = () => {
  return new Promise((resolve, reject) => {
    try {
      log.info('initServices')
      logic.init(state, coms)
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
function serviceFunctions (args) {
  let Service = require('node-windows').Service
  // Create a new service object
  let svc = new Service({
    name: 'Lemuria',
    description: 'SPEC coms module.',
    script: process.cwd() + '\\lemuria.js'
  })

  // Listen for the "install" events
  svc.on('install', function () { console.log('Service installed') })
  svc.on('uninstall', function () { console.log('Service uninstalled') })

  // Execute command
  switch (args[2]) {
    case 'i':svc.install(); break
    case 'u':svc.uninstall(); break
  }
}

module.exports = {
  getDatabases: getDatabases,
  manageSession: manageSession
}

// Start Lemuria
init()

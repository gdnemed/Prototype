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
const objects = require('./objects/objects')
const inputs = require('./inputs/inputs')
const coms = require('./coms/coms')
const files = require('./exchange/files')
const logic = require('./logic')
const logger = require('./utils/log')
const migrations = require('./migrations')

let home, environment, databases, customers, api, httpServer, logM, log

const init = () => {
  // Install/uninstall as a service
  if (process.argv.length > 2) serviceFunctions(process.argv)
  else {
    // Run it as a program
    initConfiguration()
    migrations.init().then((knexRefs) => {
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
  customers = ['SPEC']
}

// debug: verifies that each knex object for each db exists
const debugTestKnexRefs = (knexRefs) => {
  return new Promise((resolve, reject) => {
    log.info('Verifying migration')
    databases = {SPEC: knexRefs}
    let kState = knexRefs['state']
    let kObjects = knexRefs['objects']
    let kInputs = knexRefs['inputs']

    // TODO: uncomment this when DB work is done
    // customers['SPEC'].dbs = knexRefs

    // testing knex ojbect that holds 'state' db
    kState.select().table('settings')
      .then((collection) => logM.debug('settings len  = ' + collection.length))
      .catch((err) => logM.error('ERROR: in GET settings : ' + err))

    // testing knex ojbect that holds 'objects' db
    kObjects.select().table('entity_1')
      .then((collection) => logM.debug('entity_ len  = ' + collection.length))
      .catch((err) => logM.error('ERROR: in GET entity_ : ' + err))

    // testing knex ojbect that holds 'inputs' db
    kInputs.select().table('local_id')
      .then((collection) => logM.debug('local_id len  = ' + collection.length))
      .catch((err) => logM.error('ERROR: in GET local_id : ' + err))

    resolve()
  })
}

function initApiServer () {
  return new Promise((resolve, reject) => {
    log.info('initApiServer')
    api = express()
    api.use(bodyParser.json())
    // API functions
    api.get('/api/coms/records', (req, res) => manageSession(req, res, logic.getRecords))
    api.post('/api/coms/records', logic.postRecord)
    api.post('/api/coms/records/:id', logic.postRecord)
    api.delete('/api/coms/records/:id', logic.deleteRecord)
    api.get('/api/coms/records/:id/cards', logic.getCards)
    api.post('/api/coms/records/:id/cards', logic.postCards)
    api.get('/api/coms/records/:id/fingerprints', logic.getFingerprints)
    api.post('/api/coms/records/:id/fingerprints', logic.postFingerprints)
    api.post('/api/coms/records/:id/enroll', logic.postEnroll)
    api.get('/api/coms/records/:id/info', logic.getInfo)
    api.get('/api/coms/infos', logic.getInfos)
    api.post('/api/coms/records/:id/info', logic.postInfo)
    api.get('/api/coms/clockings', logic.getClockings)
    api.get('/api/coms/clockings_debug', logic.getClockingsDebug)
    api.post('/api/objects/query', (req, res) => manageSession(req, res, objects.query))
    api.post('/api/objects/sentence', (req, res) => manageSession(req, res, objects.sentence))
    api.get('/api/objects/entities', objects.getEntitiesDebug)
    api.get('/api/objects/properties', objects.getPropertiesDebug)
    api.get('/api/objects/relations', objects.getRelationsDebug)
    api.post('/api/state/settings', state.post_settings)
    api.get('/api/state/settings', state.get_settings)
    api.get('/api/coms/timetypes', logic.getTimeTypes)
    api.get('/api/coms/timetypes/:id', logic.getTimeType)
    api.post('/api/coms/timetypes', logic.postTimeType)
    api.post('/api/coms/timetypes/:id', logic.postTimeType)
    api.delete('/api/coms/timetypes/:id', logic.deleteTimeType)
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
    dbs: databases[customer],
    now: parseInt(now),
    today: parseInt(now.substring(0, 8))}
  f(req, res, session)
}

const initServices = () => {
  return new Promise((resolve, reject) => {
    try {
      log.info('initServices')
      objects.init(environment.node_id, customers, state)
      inputs.init(environment.node_id, customers)
      logic.init(objects, inputs, coms)
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

// Start Lemuria
init()

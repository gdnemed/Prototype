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
const objects = require('./objects/objects')
const inputs = require('./inputs/inputs')
const coms = require('./coms/coms')
const files = require('./exchange/files')
const logic = require('./logic')
const logger = require('./utils/log')
const migrations = require('./migrations')

let environment, api, httpServer

let logM = logger.getLogger('migration')
// Entry point: starts Lemuria app after executing migrations
migrations.init()
  .then((knex) => main(knex))
  .catch((err) => logM.error('ERROR: cannot start Lemuria (migration has not been properly executed)'))

// debug: verifies that each knex object for each db exists
const debugTestKnexRefs = (knexRefs) => {
  let kState = knexRefs['state']
  let kObjects = knexRefs['objects']
  let kInputs = knexRefs['inputs']

  // testing knex ojbect that holds 'state' db
  kState.select().table('settings')
    .then((collection) => logM.debug('settings len  = ' + collection.length))
    .catch((err) => logM.error('ERROR: in GET settings : ' + err))

  // testing knex ojbect that holds 'objects' db
  kObjects.select().table('entity_')
    .then((collection) => logM.debug('entity_ len  = ' + collection.length))
    .catch((err) => logM.error('ERROR: in GET entity_ : ' + err))

  // testing knex ojbect that holds 'inputs' db
  kInputs.select().table('local_id')
    .then((collection) => logM.debug('local_id len  = ' + collection.length))
    .catch((err) => logM.error('ERROR: in GET local_id : ' + err))
}

const main = (knexRefs) => {
  let home = process.cwd()
  logger.configure(home)

  debugTestKnexRefs(knexRefs)

  // Install/uninstall service, or run it as a program
  if (process.argv.length > 2) serviceFunctions(process.argv)
  else {
    try {
      environment = JSON.parse(fs.readFileSync(home + '/config.json', 'utf8'))
    } catch (err) {
      logger.getLogger('main').info('config.json not found, using default configuration.')
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

    let customers = ['SPEC']
    state.init(customers)
    objects.init(environment.node_id, customers, state)
    inputs.init(environment.node_id, customers)
    logic.init(objects, inputs, coms)
    coms.init(environment.coms_listen, logic)
    initApiServer()
    files.init(environment.exchange.files)
  }
}

function initApiServer () {
  api = express()
  api.use(bodyParser.json())
  // API functions
  api.get('/api/coms/records', logic.getRecords)
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
  api.post('/api/objects/query', objects.query)
  api.post('/api/objects/sentence', objects.sentence)
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
  httpServer = api.listen(environment.api_listen.port, function () {
    let address = httpServer.address()
    logger.getLogger('main').info('API listening at port ' + address.port)
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
  svc.on('install', function () { logger.getLogger('main').info('Service installed') })
  svc.on('uninstall', function () { logger.getLogger('main').info('Service uninstalled') })

  // Execute command
  switch (args[2]) {
    case 'i':svc.install(); break
    case 'u':svc.uninstall(); break
  }
}

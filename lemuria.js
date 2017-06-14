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

var environment
var api
var httpServer

main()

function main () {
  let home = process.cwd()
  logger.configure(home)
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

    var customers = ['SPEC']
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
  api.get('/api/coms/clockings', logic.getClockings)
  api.get('/api/coms/clockings_debug', logic.getClockingsDebug)
  api.post('/api/objects/query', objects.query)
  api.post('/api/objects/sentence', objects.sentence)
  api.get('/api/objects/entities', objects.get_entities_debug)
  api.get('/api/objects/properties', objects.get_properties_debug)
  api.get('/api/objects/relations', objects.get_relations_debug)
  api.post('/api/state/settings', state.post_settings)
  api.get('/api/state/settings', state.get_settings)
  // Run http server
  httpServer = api.listen(environment.api_listen.port, function () {
    var address = httpServer.address()
    logger.getLogger('main').info('API listening at port ' + address.port)
  })
}

/*
Installs/unistalls Lemuria as a Windows service.
args: Command line parameters. args[2] contains i/u for installing/uninstalling.
*/
function serviceFunctions (args) {
  var Service = require('node-windows').Service
  // Create a new service object
  var svc = new Service({
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

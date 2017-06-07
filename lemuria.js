// -------------------------------------------------------------------------------------------
// Main Lemuria entry point.
// -Installs/uninstalls Lemuria as a service
// -Initialize Lemuria services
// -Starts http server for API calls
// -------------------------------------------------------------------------------------------

var fs = require('fs')
var express = require('express')
var bodyParser = require('body-parser')

var state = require('./state/state')
var objects = require('./objects/objects')
var inputs = require('./inputs/inputs')
var coms = require('./coms/coms')
var logic = require('./logic')
var logger = require('./utils/log')
var environment
var api
var http_server

main()

function main () {
  logger.configure()
  // Install/uninstall service, or run it as a program
  if (process.argv.length > 2) service_functions(process.argv)
  else {
    try {
      environment = JSON.parse(fs.readFileSync('./config.json', 'utf8'))
    } catch (err) {
      logger.getLogger('main').info('config.json not found, using default configuration.')
      environment = {
      		'api_listen': {'host': '', 'port': 8081},
      		'coms_listen': {'host': '', 'port': 8092},
      		'node_id': 1
      }
    }

    var customers = ['SPEC']
    state.init(customers)
    objects.init(environment.node_id, customers, state)
    inputs.init(environment.node_id, customers)
    logic.init(objects, inputs, coms)
    coms.init(environment.coms_listen, logic)
    init_api_server()
  }
}

function init_api_server () {
  api = express()
  api.use(bodyParser.json())
  // API functions
  api.get('/api/coms/records', logic.get_records)
  api.post('/api/coms/records', logic.post_record)
  api.delete('/api/coms/records/:id', logic.delete_record)
  api.get('/api/coms/records/:id/cards', logic.get_cards)
  api.post('/api/coms/records/:id/cards', logic.post_cards)
  api.get('/api/coms/records/:id/fingerprints', logic.get_fingerprints)
  api.post('/api/coms/records/:id/fingerprints', logic.post_fingerprints)
  api.post('/api/coms/records/:id/enroll', logic.post_enroll)
  api.get('/api/coms/clockings', logic.get_clockings)
  api.get('/api/coms/clockings_debug', logic.get_clockings_debug)
  api.post('/api/objects/query', objects.get_query)
  api.get('/api/objects/entities', objects.get_entities_debug)
  api.get('/api/objects/properties', objects.get_properties_debug)
  api.get('/api/objects/relations', objects.get_relations_debug)
  api.post('/api/state/settings', state.post_settings)
  api.get('/api/state/settings', state.get_settings)
  // Run http server
  http_server = api.listen(environment.api_listen.port, function () {
		  var address = http_server.address()
		  logger.getLogger('main').info('API listening at port ' + address.port)
  })
}

/*
Installs/unistalls Lemuria as a Windows service.
args: Command line parameters. args[2] contains i/u for installing/uninstalling.
*/
function service_functions (args) {
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

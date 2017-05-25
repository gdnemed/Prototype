var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');

var state=require('./state/state');
var objects=require('./objects/objects');
var inputs=require('./inputs/inputs');
var coms=require('./coms/coms');
var logic=require('./logic');
var environment;
var api;
var http_server;

main();

function main(){
  //Install/uninstall service, or run it as a program
  if (process.argv.length>2) service_functions(process.argv);
  else{
    environment=JSON.parse(fs.readFileSync('./config.json', 'utf8'));

    var customers=['SPEC'];
    state.init(customers);
    objects.init(environment.node_id,customers,state);
    inputs.init(environment.node_id,customers);
    logic.init(objects,inputs,coms);
    coms.init(environment.coms_listen,logic);
    init_api_server();
  }
}

function init_api_server(){
  api=express();
  api.use(bodyParser.json());
  //API functions
  api.get('/api/coms/records',logic.get_records);
  api.post('/api/coms/records',logic.post_record);
  api.delete('/api/coms/records/:id',logic.delete_record);
  api.get('/api/coms/records/:id/cards',logic.get_cards);
  api.post('/api/coms/records/:id/cards',logic.post_cards);
  api.get('/api/coms/records/:id/fingerprints',logic.get_fingerprints);
  api.post('/api/coms/records/:id/fingerprints',logic.post_fingerprints);
  api.get('/api/coms/clockings',logic.get_clockings);
  api.get('/api/coms/clockings_debug',logic.get_clockings_debug);
  api.get('/api/objects/entities',logic.get_entities);
  api.get('/api/objects/properties',logic.get_properties);
  api.get('/api/objects/relations',logic.get_relations);
  //Run http server
  http_server = api.listen(environment.api_listen.port, function () {
		  var address = http_server.address();
		  console.log("API listening at port "+address.port);
	});
}

function service_functions(args){
  var Service = require('node-windows').Service;
  // Create a new service object
  var svc = new Service({
    name:'Lemuria',
    description: 'SPEC coms module.',
    script: process.cwd()+'\\lemuria.js'
  });

  // Listen for the "install" events
  svc.on('install',function(){console.log('Service installed');});
  svc.on('uninstall',function(){console.log('Service uninstalled');});

  //Execute command
  switch(args[2]){
    case 'i':svc.install();break;
    case 'u':svc.uninstall();break;
  }
}

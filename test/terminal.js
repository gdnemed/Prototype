var net = require('net');
var express = require('express');
var bodyParser = require('body-parser');
var api;

var sequence=1;
var cards={};
var records={};
var client = new net.Socket();

init();

function init(){
  client.connect(8082, '127.0.0.1', function() {
  	console.log('Connected');
    send({serial:'c32a034',cmd:1,protocol:'0.1'});
  });

  client.on('data', function(data_buffer) {
    var data=data_buffer.toString('utf-8');
  	console.log(data);
    var j=JSON.parse(data);
    if (j.ack){

    }
    else{
       switch(j.cmd){
        case 2:cards['c'+j.card]=j.id;
        break;
        case 3:records['r'+j.id]=true;
        break;
      }
      client.write(JSON.stringify({seq:j.seq,cmd:j.cmd,ack:1}));
    }
  });

  client.on('close', function() {
  	console.log('Connection closed');
  });

  init_api_server();
}

function send(data){
  data.seq=sequence;
  client.write(JSON.stringify(data));
  sequence++;
}

function clocking(card,id){
  var tmp=new Date().getTime();
  send({cmd:4,id:id,card:card,resp:id==null?1:0,reader:0,tmp:tmp});
}

function init_api_server(){
  api=express();
  api.use(bodyParser.json());
  //API functions
  api.get('/records',get_records);
  api.get('/cards',get_cards);
  api.get('/clocking/:card',get_clocking);
  //Run http server
  http_server = api.listen('9090', function () {});
}

function get_records(req,res){

}

function get_cards(req,res){

}

function get_clocking(req,res){
  var id=cards['c'+req.params.card];
  clocking(req.params.card,id);
  res.end(req.params.card+" clocking");
}

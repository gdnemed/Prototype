// -------------------------------------------------------------------------------------------
// Terminals simulator, for tests.
// -------------------------------------------------------------------------------------------

var net = require('net')
var msgpack = require('msgpack-lite')
var express = require('express')
var bodyParser = require('body-parser')
var api

var sequence = 1
var cards = {}
var records = {}
var client = new net.Socket()

init()

function init () {
  client.connect(8092, '172.18.4.203', function () {
  	console.log('Connected')
    var bin = Buffer.from('c8f6', 'hex')
    var init_str = {serial: 'c32a034', cmd: 1, protocol: '0.1', bin: bin}
    send(init_str)
  })

  client.on('data', function (data_buffer) {
    var j = msgpack.decode(data_buffer)
    // var data=data_buffer.toString('utf-8');
    // var j=JSON.parse(data);
  	console.log(j)

    if (j.ack) {

    } else {
      switch (j.cmd) {
        case 2:for (var i = 0; i < j.cards.length; i++) cards['c' + j.cards[i].card] = j.cards[i].id
          break
        case 3:for (var i = 0; i < j.records.length; i++) records['r' + j.records[i].id] = true
          break
      }
      // client.write(JSON.stringify({seq:j.seq,cmd:j.cmd,ack:1}));
      client.write(msgpack.encode({seq: j.seq, cmd: j.cmd, ack: 1}))
    }
  })

  client.on('close', function () {
  	console.log('Connection closed')
  })

  init_api_server()
}

function send (data) {
  data.seq = sequence
  // client.write(JSON.stringify(data));
  var m = msgpack.encode(data)
  console.log(data)
  client.write(m)
  sequence++
}

function clocking (card, id) {
  var tmp = new Date().getTime()
  send({cmd: 4, id: id, card: card, resp: id == null ? 1 : 0, reader: 0, tmp: tmp})
}

function init_api_server () {
  api = express()
  api.use(bodyParser.json())
  // API functions
  api.get('/records', get_records)
  api.get('/cards', get_cards)
  api.get('/clocking/:card', get_clocking)
  // Run http server
  http_server = api.listen('9090', function () {})
}

function get_records (req, res) {
  res.jsonp(records)
}

function get_cards (req, res) {
  res.jsonp(cards)
}

function get_clocking (req, res) {
  var id = cards['c' + req.params.card]
  clocking(req.params.card, id)
  res.end(req.params.card + ' clocking')
}

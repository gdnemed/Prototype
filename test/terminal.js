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
var buffer

init()

function init () {
  client.connect(8082, '172.18.4.203', function () {
  	console.log('Connected')
    var bin = Buffer.from('c8f6', 'hex')
    var init_str = {serial: 'c32a034', cmd: 1, protocol: '0.1', bin: bin}
    send(init_str, sequence++)
  })

  client.on('data', function (dataBuffer) {
    // If there was a piece of information, concatenate with this
    if (buffer) {
      let newb = Buffer.allocUnsafe(buffer.length + dataBuffer.length)
      buffer.copy(newb, 0)
      dataBuffer.copy(newb, buffer.length)
      dataBuffer = newb
    }
    // At least we need length
    if (dataBuffer.length < 2) {
      buffer = dataBuffer
      return
    }
    let l = dataBuffer.readUInt16LE(0)
    // We still don't have the frame
    if (l > dataBuffer.length) {
      buffer = dataBuffer
      return
    }
    let s = dataBuffer.readUInt16LE(2)
    let b = Buffer.allocUnsafe(l - 4)
    dataBuffer.copy(b, 0, 4, l)
    // Remaining information must be kept for new receive
    if (l < dataBuffer.length) {
      buffer = Buffer.allocUnsafe(dataBuffer.length - l)
      dataBuffer.copy(buffer, 0, l)
    } else buffer = null

    var j = msgpack.decode(b)
    j.seq = s
    console.log(j)
    if (j.ack) {

    } else {
      switch (j.cmd) {
        case 2:for (let i = 0; i < j.cards.length; i++) cards['c' + j.cards[i].card] = j.cards[i].id
          break
        case 3:for (let i = 0; i < j.records.length; i++) records['r' + j.records[i].id] = true
          break
      }
      // client.write(JSON.stringify({seq:j.seq,cmd:j.cmd,ack:1}));
      send({cmd: j.cmd, ack: 1}, j.seq)
    }
  })

  client.on('close', function () {
  	console.log('Connection closed')
  })

  init_api_server()
}

function send (data, seq) {
  console.log(data)
  var m = msgpack.encode(data)
  let b = Buffer.allocUnsafe(m.length + 4)
  b.writeUInt16LE(b.length, 0)
  b.writeUInt16LE(seq, 2)
  m.copy(b, 4)

  let b1 = Buffer.allocUnsafe(b.length - 5)
  let b2 = Buffer.allocUnsafe(5)
  b.copy(b1, 0, 0, b.length - 5)
  client.write(b1)
  b.copy(b2, 0, b.length - 5, b.length)
  client.write(b2)
}

function clocking (card, id) {
  var tmp = new Date().getTime()
  send({cmd: 4,
    id: id,
    card: card,
    resp: id == null ? 1 : 0,
    reader: 0,
    tmp: tmp},
  sequence++)
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

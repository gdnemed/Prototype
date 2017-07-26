// -------------------------------------------------------------------------------------------
// Terminals simulator, for tests.
// -------------------------------------------------------------------------------------------

const net = require('net')
const msgpack = require('msgpack-lite')
const express = require('express')
const bodyParser = require('body-parser')
let api

let sequence = 1
let cards = {}
let records = {}
let client = new net.Socket()
let buffer

init()

function init () {
  client.connect(8092, '172.18.4.203', function () {
    console.log('Connected')
    let bin = Buffer.from('c8f6', 'hex')
    let initStr = {serial: '123', cmd: 1, protocol: '0.1', bin: bin}
    send(initStr, sequence++)
  })

  client.on('data', function (dataBuffer) {
    while (dataBuffer != null || (buffer && buffer != null)) {
      // If there was a piece of information, concatenate with this
      if (buffer && buffer != null) {
        if (dataBuffer != null) {
          let newb = Buffer.allocUnsafe(buffer.length + dataBuffer.length)
          buffer.copy(newb, 0)
          dataBuffer.copy(newb, buffer.length)
          dataBuffer = newb
        } else {
          dataBuffer = buffer
          buffer = null
        }
      }
      // At least we need length
      if (dataBuffer.length < 2) {
        buffer = dataBuffer
        console.log('n < 2')
        return
      }
      let l = dataBuffer.readUInt16LE(0)
      // We still don't have the frame
      if (l > dataBuffer.length) {
        buffer = dataBuffer
        console.log('n < l')
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
      dataBuffer = null
      let j = msgpack.decode(b)
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
    }
  })

  client.on('close', function () {
    console.log('Connection closed')
  })

  initAPIserver()
}

function send (data, seq) {
  console.log(data)
  let m = msgpack.encode(data)
  let b = Buffer.allocUnsafe(m.length + 4)
  b.writeUInt16LE(b.length, 0)
  b.writeUInt16LE(seq, 2)
  m.copy(b, 4)
  client.write(b)
  /*
  let b1 = Buffer.allocUnsafe(b.length - 5)
  let b2 = Buffer.allocUnsafe(5)
 /* b.copy(b1, 0, 0, b.length - 5)
  client.write(b1)
  b.copy(b2, 0, b.length - 5, b.length)
  client.write(b2) */
}

function clocking (card, id) {
  let tmp = Math.floor(new Date().getTime() / 1000)
  send({cmd: 4,
    id: id,
    card: card,
    resp: id == null ? 1 : 0,
    reader: 0,
    tmp: tmp},
  sequence++)
}

function initAPIserver () {
  api = express()
  api.use(bodyParser.json())
  // API functions
  api.get('/records', getRecords)
  api.get('/cards', getCards)
  api.get('/clocking/:card', getClocking)
  // Run http server
  api.listen('9090', function () {})
}

function getRecords (req, res) {
  res.jsonp(records)
}

function getCards (req, res) {
  res.jsonp(cards)
}

function getClocking (req, res) {
  var id = cards['c' + req.params.card]
  clocking(req.params.card, id)
  res.end(req.params.card + ' clocking')
}

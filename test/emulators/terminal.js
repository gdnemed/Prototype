// -------------------------------------------------------------------------------------------
// Terminals simulator, for tests.
// -------------------------------------------------------------------------------------------

const fs = require('fs')
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
let mapClockings = {}

const init = () => {
  let cfg = JSON.parse(fs.readFileSync(process.cwd() + '/terminal.json', 'utf8'))
  client.connect(cfg.server.port, cfg.server.host, function () {
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
      if (j.ack !== undefined) {
        // If there is a callback for receive, call it
        if (mapClockings[j.seq]) {
          mapClockings[j.seq](j.ack)
          delete mapClockings[j.seq]
        }
      } else {
        switch (j.cmd) {
          case 2:for (let i = 0; i < j.cards.length; i++) cards['c' + j.cards[i].card] = j.cards[i].id
            break
          case 3:for (let i = 0; i < j.records.length; i++) records['r' + j.records[i].id] = true
            break
          case 6:cards = {}
            break
          case 7:records = {}
            break
          case 8:for (let i = 0; i < j.cards.length; i++) delete cards['c' + j.cards[i].card]
            break
          case 9:for (let i = 0; i < j.records.length; i++) delete records['r' + j.records[i].id]
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

const send = (data, seq) => {
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

const clocking = (card, id, callback) => {
  let tmp = Math.floor(new Date().getTime() / 1000)
  let seq = sequence++
  mapClockings[seq] = callback
  send({cmd: 4,
    id: id,
    card: card,
    resp: id == null ? 1 : 0,
    reader: 0,
    tmp: tmp},
  seq)
}

const initAPIserver = () => {
  api = express()
  api.use(bodyParser.json())
  // API functions
  api.get('/records', getRecords)
  api.get('/cards', getCards)
  api.get('/clocking/:card', getClocking)
  // Run http server
  api.listen('9090', function () {})
}

const getRecords = (req, res) => {
  res.jsonp(records)
}

const getCards = (req, res) => {
  res.jsonp(cards)
}

const getClocking = (req, res) => {
  var id = cards['c' + req.params.card]
  clocking(req.params.card, id, (ack) => {
    if (ack === 1) res.end(req.params.card + ' clocking')
    else res.status(500).end('nack: ' + ack)
  })
}

init()

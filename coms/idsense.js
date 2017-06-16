// -------------------------------------------------------------------------------------------
// idSense specific module.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const msgpack = require('msgpack-lite')

const logger = require.main.require('./utils/log').getLogger('coms')

var withHeader = false

const send = (socket, command, data) => {
  logger.trace(command)
  logger.trace(data)
  switch (command) {
    case 'card_insert':data.cmd = 2; break
    case 'record_insert':data.cmd = 3; break
  }
  if (withHeader) {
    sendFrame(data, socket.specInfo.seq, socket)
  } else {
    data.seq = socket.specInfo.seq
    var str = msgpack.encode(data)
    socket.write(str)
  }
  socket.specInfo.seq++
}

const ack = (frame, socket) => { nack(frame, socket, 1) }

const nack = (frame, socket, code) => {
  if (withHeader) {
    sendFrame({ack: code, cmd: frame.cmd}, frame.seq, socket)
  } else {
    let j = {seq: frame.seq, ack: code, cmd: frame.cmd}
    let str = msgpack.encode(j)
    socket.write(str)
  }
}

const sendFrame = (j, seq, socket) => {
  let str = msgpack.encode(j)
  let b = Buffer.allocUnsafe(str.length + 4)
  str.copy(b, 4)
  b.writeUInt16BE(seq, 0)
  b.writeUInt16BE(str.length, 2)
  socket.write(b)
}

const receive = (data, socket, logicService) => {
  if (data.ack) {
// Something to do?
  } else {
    switch (data.cmd) {
      case 4:newClocking(data, socket, logicService)
    }
  }
}

const newClocking = (data, socket, logicService) => {
  var info = socket.specInfo
  var clocking = {serial: info.serial, record: data.id, card: data.card, result: data.resp, source: 0}
  clocking.reception = moment.tz(new Date().getTime(), 'GMT').format('YYYYMMDDHHmmss')
  clocking.gmt = moment.tz(data.tmp, 'GMT').format('YYYYMMDDHHmmss')
  clocking.tmp = moment.tz(data.tmp, info.timezone).format('YYYYMMDDHHmmss')

  logicService.createClocking(clocking, info.customer, function (err) {
    if (err) {
      logger.error(err.message)
      nack(data, socket, 0)
    } else ack(data, socket)
  })
}

module.exports = {

  send: send,
  ack: ack,
  nack: nack,
  receive: receive

}

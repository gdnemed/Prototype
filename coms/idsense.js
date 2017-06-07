// -------------------------------------------------------------------------------------------
// idSense specific module.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const msgpack = require('msgpack-lite')

const logger = require.main.require('./utils/log')

const send = (socket, command, data) => {
  switch (command) {
    case 'card_insert':data.cmd = 2; break
    case 'record_insert':data.cmd = 3; break
  }
  data.seq = socket.spec_info.seq
// var str=JSON.stringify(data);
  var str = msgpack.encode(data)
  socket.write(str)
  socket.spec_info.seq++
}

const ack = (frame, socket) => { exports.nack(frame, socket, 1) }

const nack = (frame, socket, code) => {
  var j = {seq: frame.seq, ack: code, cmd: frame.cmd}
// var str=JSON.stringify(j);
  var str = msgpack.encode(j)
  socket.write(str)
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
  var info = socket.spec_info
  var clocking = {serial: info.serial, record: data.id, card: data.card, result: data.resp, source: 0}
  clocking.reception = moment.tz(new Date().getTime(), 'GMT').format('YYYYMMDDHHmmss')
  clocking.gmt = moment.tz(data.tmp, 'GMT').format('YYYYMMDDHHmmss')
  clocking.tmp = moment.tz(data.tmp, info.timezone).format('YYYYMMDDHHmmss')

  logicService.create_clocking(clocking, info.customer, function (err) {
    if (err) {
      logger.getLogger('coms').error(err.message)
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

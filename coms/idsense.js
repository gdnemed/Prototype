// -------------------------------------------------------------------------------------------
// idSense specific module.
// -------------------------------------------------------------------------------------------

const msgpack = require('msgpack-lite')

const logger = require.main.require('./utils/log').getLogger('coms')
const utils = require.main.require('./utils/utils')

/*
Places information in the queue to be sent to terminal.
*/
const send = (socket, command, data) => {
  socket.specInfo.queue.push({command: command, data: data})
  // If no ack pending, send frame
  if (socket.specInfo.ackCount === 0) pushQueue(socket)
}

const receive = (data, socket, logicService) => {
  if (data.ack) {
    socket.specInfo.ackCount--
    pushQueue(socket)
  } else {
    switch (data.cmd) {
      case 4:newClocking(data, socket, logicService)
    }
  }
}

const pushQueue = (socket) => {
  let q = socket.specInfo.queue
  if (q.length > 0) {
    let e = q.shift()
    sendQueueItem(socket, e.command, e.data)
  }
}

const sendQueueItem = (socket, command, data) => {
  switch (command) {
    case 'card_insert':data.cmd = 2; break
    case 'record_insert':data.cmd = 3; break
    case 'record_delete':logger.debug(command)
      logger.debug(data)
      return
    case 'clock':data.cmd = 5; break
    default:logger.error('Command not found: ' + command)
      return
  }
  socket.specInfo.ackCount++
  sendFrame(data, socket.specInfo.seq, socket)
  socket.specInfo.seq++
}

const ack = (frame, socket) => { nack(frame, socket, 1) }

const nack = (frame, socket, code) => {
  sendFrame({cmd: frame.cmd, ack: code}, frame.seq, socket)
}

const sendFrame = (j, seq, socket) => {
  logger.trace('-> Send data')
  logger.trace(j)
  let str = msgpack.encode(j)
  let b = Buffer.allocUnsafe(str.length + 4)
  b.writeUInt16LE(b.length, 0)
  b.writeUInt16LE(seq, 2)
  str.copy(b, 4)
  socket.write(b)
}

const newClocking = (data, socket, logicService) => {
  var info = socket.specInfo
  var clocking = {
    serial: info.serial,
    record: data.id + '',
    card: data.card,
    result: data.resp,
    source: 0
  }
  clocking.reception = utils.now()
  clocking.gmt = utils.tsToTime(data.tmp * 1000, 'GMT')
  clocking.tmp = utils.tsToTime(data.tmp * 1000, info.timezone)
  logger.trace(clocking)
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

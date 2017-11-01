// -------------------------------------------------------------------------------------------
// idSense specific module.
// -------------------------------------------------------------------------------------------

const msgpack = require('msgpack-lite')
const log = require('../utils/log').getLogger('coms')
const utils = require('../utils/utils')

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
      case 4: newClocking(data, socket, logicService); break
      case 20: receiveConfig(data, socket, logicService); break
      case 21: checkUser(data, socket, logicService); break
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
  if (data === null) data = {}
  switch (command) {
    case 'card_insert':data.cmd = 2; break
    case 'record_insert':data.cmd = 3; break
    case 'clock':data.cmd = 5; break
    case 'card_delete_complete':data.cmd = 6; break
    case 'record_delete_complete':data.cmd = 7; break
    case 'card_delete':data.cmd = 8; break
    case 'record_delete':data.cmd = 9; break
    case 'read_config_file':data.cmd = 20; break
    default:log.error('Command not found: ' + command)
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
  log.trace('-> Send data')
  log.trace(j)
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
  if (data.id === null || data.id === undefined) delete clocking.record
  clocking.reception = utils.now()
  clocking.gmt = utils.tsToTime(data.tmp * 1000, 'GMT')
  clocking.tmp = utils.tsToTime(data.tmp * 1000, info.timezone)
  log.trace(clocking)
  logicService.createClocking(clocking, info.customer)
    .then((clocking) => {
      ack(data, socket)
    })
    .catch((err) => {
      log.error(err.message)
      nack(data, socket, 0)
    })
}

// An idSense terminal asks Lemuria if a given user can proceed to enroll
const checkUser = (data, socket, logicService) => {
  var info = socket.specInfo
  if (data.id === null || data.id === undefined) {
    // negative answer
    sendFrame({cmd: data.cmd, id: data.id, resp: 0, reader: 0, msg: 'Invalid identifier'}, data.seq, socket)
  } else {
    logicService.checkUserEnroll(data.id, info.customer)
      .then((record) => {
        if (record && record.id) {
          if (record.enroll) {
            let enroll = JSON.parse(record.enroll)
            let id2Enroll = '0' // no enroll
            let message = 'Enroll no permitido'
            if (enroll.devices && socket.specInfo.serial !== enroll.devices) {
              message = 'Enroll no permitido en este dispositivo'
            } else if (enroll.identifiers === 2) {
              id2Enroll = 'C'
              message = 'Aproxime la tarjeta al lector'
            } else if (enroll.identifiers === 1 || enroll.identifiers === 3) {
              id2Enroll = 'F'
              message = 'Ponga la huella 1 en el sensor'
            }
            sendFrame({
              cmd: data.cmd,
              id: data.id,
              resp: id2Enroll,
              reader: 0,
              msg: message
            }, data.seq, socket)
          }
          return
        }
        sendFrame({cmd: data.cmd, id: data.id, resp: 0, reader: 0, msg: 'Usuario desconocido'}, data.seq, socket)
      })
      .catch((err) => {
        log.error(err.message)
        sendFrame({cmd: data.cmd, id: data.id, resp: 0, reader: 0, msg: 'Error al validar usuario'}, data.seq, socket)
      })
  }
}

const receiveConfig = (data, socket, logicService) => {
  // TODO: Hay que hacer algo?
}

module.exports = {

  send: send,
  ack: ack,
  nack: nack,
  receive: receive

}

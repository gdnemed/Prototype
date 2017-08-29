// -------------------------------------------------------------------------------------------
// Generic communications module. Specific functions of every terminal type must be
// implemented in its corresponding module.
//
// -Listens to a TCP port and mantains connections.
// -Get terminal data to create a concrete terminal type.
// -Distributes information to the corresponding connections.
// -------------------------------------------------------------------------------------------

const net = require('net')
const msgpack = require('msgpack-lite')
const g = require('../global')

const logger = require('../utils/log')

let clients = {}
let tablesVersions = {records: 0, cards: 0, time_types: 0}
let idsense
let logicService, sessionsService
let log

/*
Communications initialization.
-listen: Object containing address and port to listen.
-logic: Logic module.
*/
const init = (logic, sessions) => {
  let listen = g.getConfig().coms_listen
  if (!listen) return Promise.resolve()
  else {
    log = logger.getLogger('coms')
    log.debug('>> coms.init()')

    idsense = require('./idsense')
    logicService = logic
    sessionsService = sessions
    net.createServer(listenFunction).listen(listen.port, listen.host)
    log.info('coms listening at ' + listen.host + ':' + listen.port)
    setInterval(refreshClocks, 60000)
    return Promise.resolve()
  }
}

const listenFunction = (socket) => {
  let info = {
    name: socket.remoteAddress + ':' + socket.remotePort,
    queue: [],
    ackCount: 0
  }
  log.debug('connection from ' + info.name)
  socket.specInfo = info

  // We still don't know its name, so we put it in the map using tcp address
  clients['tcp' + info.name] = socket

  socket.on('data', (data) => receive(data, socket))
  socket.on('close', (err) => onClose(err, socket))
  socket.on('error', (err) => onError(err, socket))
}

const onError = (err, socket) => {
  log.error(socket.specInfo.name + ':' + err.message)
}

const onClose = (err, socket) => {
  if (err) onError(err, socket)
  try {
    // remove socket from the map. If initialized, use id, otherwise, name
    if (socket.specInfo.serial) delete clients['id' + socket.specInfo.serial]
    else delete clients['tcp' + socket.specInfo.name]
    log.info(socket.specInfo.name + ' closed')
  } catch (e) {
    log.error(e.message)
  }
}

const receive = (dataBuffer, socket) => {
  let info = socket.specInfo
  while (dataBuffer != null || info.buffer) {
    // If there was a piece of information, concatenate with this
    if (info.buffer) {
      if (dataBuffer != null) {
        let newb = Buffer.allocUnsafe(info.buffer.length + dataBuffer.length)
        info.buffer.copy(newb, 0)
        dataBuffer.copy(newb, info.buffer.length)
        dataBuffer = newb
      } else {
        dataBuffer = info.buffer
        delete info.buffer
      }
    }
    // At least we need length
    if (dataBuffer.length < 2) {
      info.buffer = dataBuffer
      return
    }
    let l = dataBuffer.readUInt16LE(0)
    // We still don't have the frame
    if (l > dataBuffer.length) {
      info.buffer = dataBuffer
      return
    }
    let s = dataBuffer.readUInt16LE(2)
    let b = Buffer.allocUnsafe(l - 4)
    dataBuffer.copy(b, 0, 4, l)
    // Remaining information must be kept for new receive
    if (l < dataBuffer.length) {
      info.buffer = Buffer.allocUnsafe(dataBuffer.length - l)
      dataBuffer.copy(info.buffer, 0, l)
    } else delete info.buffer
    dataBuffer = null

    let data = msgpack.decode(b)
    data.seq = s
    log.trace('<- socket ' + info.name)
    log.trace(data)
    // each type of terminal, needs its own processing
    switch (info.type) {
      case 'idSense':
        idsense.receive(data, socket, logicService)
        break
      default:
        genericReceive(data, socket)
    }
  }
}

/*
Receive function when terminal type and serial are still unknown.
*/
const genericReceive = (frame, socket) => {
  sessionsService.checkSerial(frame.serial)
    .then((customer) => {
      let info = socket.specInfo
      info.type = 'idSense'
      info.serial = frame.serial
      info.customer = customer
      info.protocol = frame.protocol
      info.timezone = 'Europe/Madrid'
      info.seq = 1
      info.identified = true
      info.tablesVersions = {records: 0, cards: 0, time_types: 0}
      if (info.serial != null && frame.cmd === 1) {
        // Change position in the map. Now we use id
        clients['id' + info.serial] = socket
        delete clients['tcp' + info.name]
        switch (info.type) {
          case 'idSense':idsense.ack(frame, socket)
            break
          default:
        }
        logicService.initTerminal(info.serial, info.customer)
// check_versions(info) <-with versions
      }
    })
    .catch((err) => {
      log.error(err.message + ', serial: ' + frame.serial)
      socket.end()
    })
}

const globalSend = (command, data) => {
  for (let property in clients) {
    if (clients.hasOwnProperty(property)) {
      let socket = clients[property]
      if (socket.specInfo.identified) sendData(socket, command, data)
    }
  }
}

const send = (serial, command, data) => {
  let socket = clients['id' + serial]
  if (socket) {
    sendData(socket, command, data)
  } else return new Error('Serial ' + serial + ' not found')
}

/*
Generic send function over a socket.
-socket: Socket on which data will be written.
-command: Lemuria command.
-data: Data to write
*/
const sendData = (socket, command, data) => {
  // each type of terminal, needs its own processing
  switch (socket.specInfo.type) {
    case 'idSense':idsense.send(socket, command, data)
      break
  }
}

/*
Compares server versions of the tables with terminal versions.
If the table of the terminal it out of date, starts an upload process.
-specInfo: Information associated to connection.
*/
const checkVersions = (specInfo) => {
  for (let tab in tablesVersions) {
    if (tablesVersions.hasOwnProperty(tab)) {
      let sv = tablesVersions[tab]
      let tv = specInfo.tablesVersions[tab]
      if (tv < sv) {
        // We put node_id=1 at the moment, should be revised
        logicService.get_pending_registers(tab, tv, specInfo.customer, 1, specInfo.serial)
      }
    }
  }
}

const refreshClocks = () => {
  for (let k in clients) {
    if (clients.hasOwnProperty(k)) {
      switch (clients[k].specInfo.type) {
        case 'idSense': idsense.send(clients[k], 'clock', {time: Math.floor(new Date().getTime() / 1000)})
          break
        default:
      }
    }
  }
}

module.exports = {

  init: init,
  send: send,
  globalSend: globalSend

}

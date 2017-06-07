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

const logger = require.main.require('./utils/log').getLogger('coms')

var clients = {}
var tablesVersions = {records: 0, cards: 0, time_types: 0}
var idsense
var logicService

/*
Communications initialization.
-listen: Object containing address and port to listen.
-logic: Logic module.
*/
const init = (listen, logic) => {
  idsense = require('./idsense')
  logicService = logic
  net.createServer(listenFunction).listen(listen.port, listen.host)
  logger.info('coms listening at ' + listen.host + ':' + listen.port)
}

const listenFunction = (socket) => {
  var info = {name: socket.remoteAddress + ':' + socket.remotePort}
  logger.debug('connection from ' + info.name)
  socket.specInfo = info

  // We still don't know its name, so we put it in the map using tcp address
  clients['tcp' + info.name] = socket

  socket.on('data', (data) => receive(data, socket))
  socket.on('close', (err) => onClose(err, socket))
  socket.on('error', (err) => onError(err, socket))
}

const onError = (err, socket) => {
  logger.error(socket.specInfo.name + ':' + err.message)
}

const onClose = (err, socket) => {
  if (err) onError(err, socket)
  try {
    // remove socket from the map. If initialized, use id, otherwise, name
    if (socket.specInfo.serial) delete clients['id' + socket.specInfo.serial]
    else delete clients['tcp' + socket.specInfo.name]
    logger.info(socket.specInfo.name + ' closed')
  } catch (e) {
    logger.error(e.message)
  }
}

const receive = (dataBuffer, socket) => {
  // var data=JSON.parse(data_buffer.toString('utf-8'));
  var data = msgpack.decode(dataBuffer)
  var info = socket.specInfo
  logger.trace('socket ' + info.name)
  logger.trace(data)
  // each type of terminal, needs its own processing
  switch (info.type) {
    case 'idSense':idsense.receive(data, socket, logicService)
      break
    default:genericReceive(data, socket)
  }
}

/*
Receive function when terminal type and serial are still unknown.
*/
const genericReceive = (frame, socket) => {
  var info = socket.specInfo
  info.type = 'idSense'
  info.serial = frame.serial
  info.customer = 'SPEC'
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
    logicService.initTerminal(info.serial)
// check_versions(info) <-with versions
  }
}

const globalSend = (command, data) => {
  for (var property in clients) {
    if (clients.hasOwnProperty(property)) {
      var socket = clients[property]
      if (socket.specInfo.identified) sendData(socket, command, data)
    }
  }
}

const send = (serial, command, data, callback) => {
  var socket = clients['id' + serial]
  if (socket) {
    sendData(socket, command, data)
    callback()
  } else callback(new Error('Serial ' + serial + ' not found'))
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
  for (var tab in tablesVersions) {
    if (tablesVersions.hasOwnProperty(tab)) {
      var sv = tablesVersions[tab]
      var tv = specInfo.tablesVersions[tab]
      if (tv < sv) {
        // We put node_id=1 at the moment, should be revised
        logicService.get_pending_registers(tab, tv, specInfo.customer, 1, specInfo.serial)
      }
    }
  }
}

module.exports = {

  init: init,
  send: send,
  globalSend: globalSend

}

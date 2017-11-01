require('dotenv').config()
require('./src/defaults').addDefaults()

let params = {}

// If passed as an argument, override
if (process.argv.indexOf('--home') !== -1) {
  params.home = process.argv[process.argv.indexOf('--home') + 1]
  process.env.LEMURIA_HOME = params.home
  console.log('Lemuria init at ' + params.home)
} else if (process.argv.indexOf('--url') === -1) {
  console.log('Init parameter needed: --home or --url')
  process.exit()
}

if (process.argv.indexOf('--ip') !== -1) {
  params.apiHost = process.argv[process.argv.indexOf('--ip') + 1]
  console.log('Lemuria IP at ' + params.apiHost)
}

if (process.argv.indexOf('--port') !== -1) {
  params.apiPort = parseInt(process.argv[process.argv.indexOf('--port') + 1])
  console.log('Lemuria PORT at ' + params.apiPort)
}

if (process.argv.indexOf('--registry') !== -1) {
  params.registry = process.argv[process.argv.indexOf('--registry') + 1]
  console.log('Lemuria REGISTRY service at ' + params.registry)
}

if (process.argv.indexOf('--bootUp') !== -1) {
  params.localServices = process.argv[process.argv.indexOf('--bootUp') + 1]
  console.log('Lemuria LEMURIA_BOOT_SERVICES: ' + params.localServices)
}

if (process.argv.indexOf('--coms') !== -1) {
  let s = process.argv[process.argv.indexOf('--coms') + 1].split(':')
  params.comsListen = {host: s[0], port: parseInt(s[1])}
}

if (process.argv.indexOf('--nodeId') !== -1) {
  params.nodeId = process.argv[process.argv.indexOf('--nodeId') + 1]
  console.log('Lemuria NODE_ID: ' + params.nodeId)
}

if (process.argv.indexOf('--env') !== -1) {
  params.environment = process.argv[process.argv.indexOf('--env') + 1]
  console.log('Lemuria NODE_ENV: ' + params.environment)
}

let lemuria = require('./src/lemuria')
lemuria.init(params)
module.exports = lemuria

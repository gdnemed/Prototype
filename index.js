require('dotenv').config()
require('./src/defaults').addDefaults()
// If passed as an argument, override
if (process.argv.indexOf('--home') !== -1) {
  process.env.HOME = process.argv[process.argv.indexOf('--home') + 1]
  console.log('Lemuria init at ' + process.env.HOME)
} else if (process.argv.indexOf('--url') === -1) {
  console.log('Init parameter needed: --home or --url')
  process.exit()
}

if (process.argv.indexOf('--ip') !== -1) {
  process.env.LEMURIA_HOST_SERVER = process.argv[process.argv.indexOf('--ip') + 1]
  console.log('Lemuria IP at ' + process.env.LEMURIA_HOST_SERVER)
}

if (process.argv.indexOf('--port') !== -1) {
  process.env.LEMURIA_PORT_API = process.argv[process.argv.indexOf('--port') + 1]
  console.log('Lemuria PORT at ' + process.env.LEMURIA_PORT_API)
}

if (process.argv.indexOf('--registry') !== -1) {
  process.env.LEMURIA_REGISTRY_URL = process.argv[process.argv.indexOf('--registry') + 1]
  console.log('Lemuria REGISTRY service at ' + process.env.LEMURIA_REGISTRY_URL)
}

if (process.argv.indexOf('--bootUp') !== -1) {
  process.env.LEMURIA_BOOT_SERVICES = process.argv[process.argv.indexOf('--bootUp') + 1]
  console.log('Lemuria LEMURIA_BOOT_SERVICES: ' + process.env.LEMURIA_BOOT_SERVICES)
}

module.exports = require('./src/lemuria')

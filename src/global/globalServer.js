// -------------------------------------------------------------------------------------------
// Global module.
// Holds global database, where customers and devices are defined,
// ands serves its content to other services.
// -------------------------------------------------------------------------------------------

const logger = require('../utils/log')
const fs = require('fs')
const httpServer = require('../httpServer')
const g = require('../global')

let log
let dbGlobal

const init = () => {
  return new Promise((resolve, reject) => {
    if (g.getConfig().globalDB === 'local') {
      log = logger.getLogger('global')
      log.debug('>> global init()')
      try {
        dbGlobal = JSON.parse(fs.readFileSync('global.json', 'utf8'))
        httpServer.getApi().get('/global/customers', getCustomers)
        httpServer.getApi().get('/global/devices', getDevices)
      } catch (e) {
        console.log('global database not found')
        process.exit()
      }
      resolve()
    } else resolve()
  })
}

const getCustomers = (req, res) => {
  res.status(200).jsonp(dbGlobal.customers)
}

const getDevices = (req, res) => {
  res.status(200).jsonp(dbGlobal.devices)
}

module.exports = {
  init
}

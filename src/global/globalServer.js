// -------------------------------------------------------------------------------------------
// Global module.
// Holds global database, where customers and devices are defined,
// ands serves its content to other services.
// -------------------------------------------------------------------------------------------

const logger = require('../utils/log')
const fs = require('fs')
const httpServer = require('../httpServer')
const sessions = require('../session/sessions')
const g = require('../global')

let log
let dbGlobal
const loadGlobalJsonFile = (path) => {
  let fileName = path + 'global.json'
  try {
    log.debug(`Using config file ${fileName}`)
    return JSON.parse(fs.readFileSync(fileName, 'utf8'))
  } catch (err) {
    log.debug(`File not found ${fileName}`)
  }
}

const init = () => {
  return new Promise((resolve, reject) => {
    if (g.isLocalService('global')) {
      log = logger.getLogger('globalServer')
      log.debug('>> globalServer init()')
      // If a spcecific 'global.json' file exists in HOME dir, loads it
      // Otherwise, the default, located at cwd must be loaded
      if (!(dbGlobal = loadGlobalJsonFile(g.getConfig().home + '/'))) {
        dbGlobal = loadGlobalJsonFile('')
      }
      if (!dbGlobal) {
        console.log('ERROR: cannot start Lemuria: global.json not found')
        process.exit()
      }
      httpServer.getApi().get('/api/global/customers', (req, res) => sessions.invokeWrapper(req, res, getCustomers))
      httpServer.getApi().get('/api/global/devices', (req, res) => sessions.invokeWrapper(req, res, getDevices))
      resolve()
    } else resolve()
  })
}

const getCustomers = () => {
  return Promise.resolve(dbGlobal.customers)
}

const getDevices = () => {
  return Promise.resolve(dbGlobal.devices)
}

module.exports = {
  init,
  getCustomers,
  getDevices
}

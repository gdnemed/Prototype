/* global require, process */
// -------------------------------------------------------------------------------------------
// Sessions module.
// -Validates API Keys and assigns customer to session
// -Validates devices and assigns customer to serial
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require('../utils/log')
const migrations = require('../migrations')
const g = require('../global')

let mapCustomers
let mapDevices
let _customers = {}
let log

const getCustomersList = () => {
  let l = []
  for (let k in mapCustomers) {
    if (mapCustomers.hasOwnProperty(k)) {
      let c = mapCustomers[k]
      c.apikey = k
      l.push(c)
    }
  }
  return l
}
const getDatabases = (customer) => {
  return _customers[customer].dbs
}

const initializeCustomer = (customersList, i) => {
  return new Promise((resolve, reject) => {
    if (i >= customersList.length) resolve()
    else {
      _customers[customersList[i].name] = {apikey: customersList[i].apikey}
      let year = new Date().getFullYear()
      migrations.init(customersList[i], year)
        .then((dbs) => {
          _customers[customersList[i].name].dbs = dbs
          log.debug('DB ' + customersList[i].name)
          return migrations.verifyDB(dbs, customersList[i].name)
        })
        .then(() => initializeCustomer(customersList, i + 1))
        .then(resolve)
        .catch(reject)
    }
  })
}

/*
 *  Wrapper to manage remote service request data types
 */
const invokeWrapper = (req, res, f) => {
  manageSession(req, res, (req, res, session) => {
    log.info('*******  INVOKE WRAPPER RECEIVED **************')
    log.info('dataType -> ' + req.body.dataType)
    log.info('data     -> ' + JSON.stringify(req.body.data))

    let param

    switch (req.body.dataType) {
      case 'undefined':
        param = null
        break
      case 'number':
        param = parseInt(req.body.data)
        break
      default:
        param = req.body.data  // string or object
    }

    f(session, param)
      .then((result) => {
        let response = {
          'dataType': (typeof result),
          'data': result
        }
        log.info('*******  INVOKE WRAPPER SENDED **************')
        log.info('response -> ' + JSON.stringify(response))
        res.status(200).send(response)
      })
      .catch((err) => res.status(500).end(err.message))
  })
}

const init = () => {
  return new Promise((resolve, reject) => {
    log = logger.getLogger('session')
    log.debug('session: init()')
    let cfg = g.getConfig()
    // If we serve an API, we are not a simple exporter or importer, and we need global database
    if (cfg.apiPort) {
      let session = {
        name: 'internal',
        apikey: '123'
      }
      g.invokeService('global', 'getCustomers', session)
        .then((customers) => {
          mapCustomers = customers
          return g.invokeService('global', 'getDevices', session)
        })
        .then((devices) => {
          mapDevices = devices
          return initializeCustomer(getCustomersList(), 0)
        })
        .then(() => g.addLocalService('sessions'))
        .then(resolve)
        .catch(reject)
    } else resolve()
  })
}

/*
Gets the session object for a sessionID.
}
 */
const getSession = (customerName) => {
  // For now, we don't use sessionID, just create a generic session object
  let ts = new Date().getTime()
  let now = moment.tz(ts, 'GMT').format('YYYYMMDDHHmmss')
  let session = {
    name: customerName,
    dbs: _customers[customerName].dbs,
    apikey: _customers[customerName].apikey,
    now: parseInt(now),
    today: parseInt(now.substring(0, 8))
  }
  return Promise.resolve(session)
}

/*
Adds session object to an API request and calls its function f.
 */
const manageSession = (req, res, f) => {
  // Simple api key
  let apiKey = req.header('Authorization')
  if (apiKey && apiKey.startsWith('APIKEY ')) {
    let customer = mapCustomers[apiKey.substr(7)]
    if (customer) {
      getSession(customer.name)
        .then((session) => {
          f(req, res, session)
        })
        .catch((err) => res.status(401).end(err.message))
    } else res.status(401).end('Customer not found')
  } else res.status(401).end('Application key required')
}

/*
Validates serial number of a device. Returns customer name.
 */
const checkSerial = (serial) => {
  return new Promise((resolve, reject) => {
    let d = mapDevices[serial]
    if (d) resolve(d)
    else reject(new Error('Invalid serial number'))
  })
}

/*
Puts headers into API call, for a customer.
*/
const setAuthorization = (customer, data) => {
  let c = _customers[customer]
  if (c) {
    data.headers = {'Authorization': 'APIKEY ' + c.apikey}
    return true
  } else return false
}

module.exports = {
  init,
  getSession,
  getCustomersList,
  manageSession,
  checkSerial,
  getDatabases,
  setAuthorization,
  invokeWrapper
}

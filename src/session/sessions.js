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

let dbGlobal
let _customers = {}
let log

const getCustomersList = () => {
  let l = []
  for (let k in dbGlobal.customers) {
    if (dbGlobal.customers.hasOwnProperty(k)) {
      let c = dbGlobal.customers[k]
      c.apikey = k.substr(1)
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
      migrations.init('sqlite3', customersList[i].name, year)
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

const init = () => {
  if (g.getConfig().api_listen) {
    dbGlobal = process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'stress_test'
      ? {customers: {k123: {name: 'SPEC'}, k124: {name: 'OCTIME'}}, devices: {t123: 'SPEC', t1105: 'SPEC', t1101: 'SPEC'}}
      : {customers: {k123: {name: 'SPEC'}}, devices: {t123: 'SPEC', t1101: 'SPEC'}}
    log = logger.getLogger('session')
    log.debug('session: init() env: ' + process.env.NODE_ENV)
    return new Promise((resolve, reject) => {
      initializeCustomer(getCustomersList(), 0)
        .then(resolve)
        .catch(reject)
    })
  } else return Promise.resolve()
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
    let customer = dbGlobal.customers['k' + apiKey.substr(7)]
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
    let d = dbGlobal.devices['t' + serial]
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
  setAuthorization
}

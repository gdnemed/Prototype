/* global require, process */
// -------------------------------------------------------------------------------------------
// Sessions module.
// -Validates API Keys and assigns customer to session
// -Validates devices and assigns customer to serial
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require('../utils/log')
const migrations = require('../migrations')
const request = require('request')
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
  /* dbGlobal = process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'stress_test'
  ? {
    customers: {k123: {name: 'SPEC'}, k124: {name: 'OCTIME'}},
    devices: {t123: 'SPEC', t1105: 'SPEC', t1101: 'SPEC'}
  }
  : {customers: {k123: {name: 'SPEC'}}, devices: {t123: 'SPEC', t1101: 'SPEC'}}
  */
  return new Promise((resolve, reject) => {
    log = logger.getLogger('session')
    log.debug('session: init() env: ' + process.env.NODE_ENV)
    let cfg = g.getConfig()
    // If we serve an API, we are not a simple exporter or importer, and we need global database
    if (cfg.api_listen) {
      // Ask for customers
      let url = 'http://127.0.0.1:' + cfg.api_listen.port + '/api/global/'
      let data = {method: 'GET', url: url + 'customers'}
      request(data, (error, response, body) => {
        if (error) reject(error)
        else {
          mapCustomers = JSON.parse(response.body)
          // Ask for devices
          data.url = url + 'devices'
          request(data, (error, response, body) => {
            if (error) reject(error)
            else {
              mapDevices = JSON.parse(response.body)
              initializeCustomer(getCustomersList(), 0)
                .then(resolve)
                .catch(reject)
            }
          })
        }
      })
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
  setAuthorization
}

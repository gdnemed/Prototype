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
      migrations.init('sqlite', customersList[i].name, year)
        .then((dbs) => {
          _customers[customersList[i].name].dbs = dbs
          log.debug('DB ' + customersList[i].name)
          return verifyDB(dbs, customersList[i].name)
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
      ? {customers: {k123: {name: 'SPEC'}, k124: {name: 'OCTIME'}}, devices: {t123: 'SPEC', t1105: 'SPEC'}}
      : {customers: {k123: {name: 'SPEC'}}, devices: {t123: 'SPEC'}}
    log = logger.getLogger('session')
    log.debug('session: init() env: ' + process.env.NODE_ENV)
    return new Promise((resolve, reject) => {
      initializeCustomer(getCustomersList(), 0)
        .then(resolve)
        .catch(reject)
    })
  } else return Promise.resolve()
}

// debug: verifies that each knex object for each db exists
const verifyDB = (dbs) => {
  return new Promise((resolve, reject) => {
    log.info('Verifying migration')
    let kState = dbs['state']
    let kObjects = dbs['objects']
    let year = 2016
    let kInputs = dbs['inputs' + year]
    kInputs.months = {}

    kState.select().table('settings')
      .then((collection) => {
        log.debug('settings len  = ' + collection.length)
        return kObjects.select().table('entity_1')
      })
      .then((collection) => {
        log.debug('entity_1 len  = ' + collection.length)
        let months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
        return Promise.all(months.map((month) => {
          return kInputs('input_1_' + year + month).count('id')
          .then((n) => {
            kInputs.months[month] = true
            log.debug(`${year}${month} inputs table found`)
          })
          .catch((err) => {
            if (err) log.debug(`${year}${month} inputs table does not exists`)
          })
        }))
          .then(resolve)
          .catch((err) => {
            console.log('ERROR: ' + err)
            reject(err)
          })
      })
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
  manageSession,
  checkSerial,
  getDatabases,
  setAuthorization
}

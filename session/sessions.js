/* global require, process */
// -------------------------------------------------------------------------------------------
// Sessions module.
// -Validates API Keys and assigns customer to session
// -Validates devices and assigns customer to serial
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require('../utils/log')
const migrations = require('../migrations')

let dbGlobal
let _customers = {}
let log

const getCustomersList = () => {
  let l = []
  for (let k in dbGlobal.customers) {
    if (dbGlobal.customers.hasOwnProperty(k)) {
      l.push(dbGlobal.customers[k])
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
      _customers[customersList[i].name] = {}
      migrations.init('sqlite', customersList[i].name, '2017')
        .then((dbs) => {
          _customers[customersList[i].name].dbs = dbs
          log.debug('DB ' + customersList[i].name)
          return debugTestdbs(dbs, customersList[i].name)
        })
        .then(() => initializeCustomer(customersList, i + 1))
        .then(resolve)
        .catch(reject)
    }
  })
}

const init = () => {
  dbGlobal = process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'stress_test'
    ? {customers: {k123: {name: 'SPEC'}, k124: {name: 'OCTIME'}}, devices: {t123: 'SPEC'}}
    : {customers: {k123: {name: 'SPEC'}}, devices: {t123: 'SPEC'}}
  log = logger.getLogger('session')
  log.debug('session: init() env: ' + process.env.NODE_ENV)
  return new Promise((resolve, reject) => {
    initializeCustomer(getCustomersList(), 0)
      .then(resolve)
      .catch(reject)
  })
}

// debug: verifies that each knex object for each db exists
const debugTestdbs = (dbs) => {
  return new Promise((resolve, reject) => {
    log.info('Verifying migration')
    let kState = dbs['state']
    let kObjects = dbs['objects']
    let kInputs = dbs['inputs']

    kState.select().table('settings')
      .then((collection) => {
        log.debug('settings len  = ' + collection.length)
        return kObjects.select().table('entity_1')
      })
      .then((collection) => {
        log.debug('entity_1 len  = ' + collection.length)
        return kInputs.select().table('input_1_201707')
      })
      .then((collection) => {
        log.debug('input_1_201707 len  = ' + collection.length)
        resolve()
      })
      .catch((err) => {
        console.log('ERROR: ' + err)
        reject(err)
      })
  })
}

/*
Gets the session object for a sessionID.
}
 */
const getSession = (custName, callback) => {
  // For now, we don't use sessionID, just create a generic session object
  let ts = new Date().getTime()
  let now = moment.tz(ts, 'GMT').format('YYYYMMDDHHmmss')
  let session = {
    name: custName,
    dbs: _customers[custName].dbs,
    now: parseInt(now),
    today: parseInt(now.substring(0, 8))}
  callback(null, session)
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
      getSession(customer.name, (err, session) => {
        if (err) res.status(401).end(err.message)
        else f(req, res, session)
      })
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

module.exports = {
  init,
  getSession,
  manageSession,
  checkSerial,
  getDatabases
}

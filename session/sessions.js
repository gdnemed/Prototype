// -------------------------------------------------------------------------------------------
// Sessions module.
// -Validates API Keys and assigns customer to session
// -Validates devices and assigns customer to serial
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')

// Global database
let global = process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'stress_test'
  ? {customers: {k123: {name: 'SPEC'}, k124: {name: 'OCTIME'}}, devices: {t123: 'SPEC'}}
: {customers: {k123: {name: 'SPEC'}}, devices: {t123: 'SPEC'}}

let customers

const init = (mainCustomers) => {
  customers = mainCustomers
}

const getCustomers = () => {
  let l = []
  for (let k in global.customers) {
    if (global.customers.hasOwnProperty(k)) {
      l.push(global.customers[k])
    }
  }
  return l
}

/*
Gets the session object for a sessionID.
}
 */
const getSession = (customer, callback) => {
  // For now, we don't use sessionID, just create a generic session object
  let ts = new Date().getTime()
  let now = moment.tz(ts, 'GMT').format('YYYYMMDDHHmmss')
  let session = {
    name: customer,
    dbs: customers[customer].dbs,
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
    let customer = global.customers['k' + apiKey.substr(7)]
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
    let d = global.devices['t' + serial]
    if (d) resolve(d)
    else reject(new Error('Invalid serial number'))
  })
}

module.exports = {
  getCustomers,
  init,
  getSession,
  manageSession,
  checkSerial
}

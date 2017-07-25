// -------------------------------------------------------------------------------------------
// Sessions module.
// -Keeps sessions.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')

// Global database
let global = process.env.NODE_ENV !== 'test'
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
    let customer = global.customers['k' + apiKey.substr(8)]
    if (customer) {
      getSession(customer.name, (err, session) => {
        if (err) res.status(401).end(err.message)
        else f(req, res, session)
      })
    } else res.status(401).end('Customer not found')
  } else res.status(401).end('Application key required')
}

module.exports = {
  getCustomers,
  init,
  getSession,
  manageSession
}

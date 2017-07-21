// -------------------------------------------------------------------------------------------
// Sessions module.
// -Keeps sessions.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')

let customers

const init = (mainCustomers) => {
  customers = mainCustomers
}

/*
Gets the session object for a sessionID.
}
 */
const getSession = (sessionID, callback) => {
  // For now, we don't use sessionID, just create a generic session object
  let customer = 'SPEC'
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
  getSession(1, (err, session) => {
    if (err) res.status(401).end(err.message)
    else f(req, res, session)
  })
}

module.exports = {
  init: init,
  getSession: getSession,
  manageSession: manageSession
}

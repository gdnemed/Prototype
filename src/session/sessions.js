/* global require, process */
// -------------------------------------------------------------------------------------------
// Sessions module.
// -Validates API Keys and assigns customer to session
// -Validates devices and assigns customer to serial
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const request = require('request')
const logger = require('../utils/log')
const migrations = require('../migrations')
const g = require('../global')
const httpServer = require('../httpServer')

let mapCustomers
let mapDevices
let _customers = {}
let log

/* Registers an API method, to be used in local or remote invokes.
- service: module.exports object from service, for getting functions and name.
- functionName: name of the local function.
- operation: HTTP operation (GET, PUT, etc.)
- url: Path in HTTP API.
- remoteFunction:
If functionName is defined, remoteFunction not required.
If functionName is null, then remoteFunction is registered as is, without wrapper.
*/
const registerMethod = (service, functionName, operation, url, remoteFunction, middleware) => {
  let f
  // If local and remote (it has a name), put it in map
  if (functionName) {
    let methods = g.getMethods()
    let reg = methods[service.serviceName]
    if (!reg) {
      reg = {}
      methods[service.serviceName] = reg
    }
    let m = reg[functionName]
    if (!m) {
      m = {}
      reg[functionName] = m
    }
    m.route = url
    m.method = operation
    m.localFunction = service[functionName]
    f = (req, res) => invokeWrapper(req, res, m.localFunction)
  } else f = remoteFunction // If only remote, just assign it
  // Add it to HTTP API
  let api = httpServer.getApi()

  if (api) {
    switch (operation) {
      case 'GET':
        if (middleware) api.get(url, middleware, f)
        else api.get(url, f)
        break
      case 'POST':api.post(url, f)
        break
      case 'DELETE':api.delete(url, f)
        break
      case 'PUT':api.put(url, f)
        break
    }
  }
}

/*
 *  All service calls are executed using this method.
 *  Depending on whether the service is available locally, or if it is an external service,
 *  this function will call the corresponding endPoint by returning a promise with the result.
 */
const invokeService = (service, methodName, session, parameters) => {
  log.warn('NEW invokeService ' + service + '.' + methodName)
  if (g.isLocalService(service)) return g.invokeLocal(service, methodName, session, parameters)
  else {
    return new Promise((resolve, reject) => {
      let error = {}; let done = false; let attempts = 0; let hostUrl = ''
      let attemptedUrls = []  // List of requested hosts to resolve invoke method
      let param = g.getMethodRoute(service, methodName)

      // Define type of params
      let paramType = (typeof parameters)

      if (paramType === 'function') {
        // Nothing to do with functions through HTTP
        reject(new Error('Type function parameter on invoke request.'))
        return
      } else if (paramType === 'undefined') {
        // Better empty string than null or undefined
        parameters = ''
      }

      /*
       *  Function requests a resource to the first service on list that respond properly.
       */
      const resilientInvoke = (done, attempts) => {
        return new Promise((resolve, reject) => {  // outer promise
          // Inner promise to iterate host services response on error
          if (!done) new Promise((resolve, reject) => {  // inner promise
            attempts++
            log.debug('resilientInvoke START attempt(' + attempts + ')')

            hostUrl = g.getUrlService(service, attemptedUrls)
            if (attemptedUrls.includes(hostUrl)) {
              log.debug('resilientInvoke REJECT(' + attempts + ') all host services.')
              reject(new Error('No service has responded to the request.'))  // inner promise
            }
            attemptedUrls.push(hostUrl)

            log.info('********** INVOKED METHOD DATA SENDED ************')
            log.info('dataType -> ' + paramType)
            log.info('data     -> ' + JSON.stringify(parameters))
            log.info('session   -> ' + JSON.stringify(session))

            let options = {
              'method': param.method,
              'url': hostUrl + param.route,
              'headers': {},
              'body': {
                'dataType': paramType,
                'data': parameters
              },
              'encoding': 'utf8',
              'json': true
            }
            if (session) options.headers.Authorization = 'APIKEY ' + session.apikey

            request(options, (err, res, body) => {
              if (err) {
                log.error('resilientInvoke CALL ' + service.toUpperCase() + ' on host ' + hostUrl + ' - attempt(' + attempts + ') ERROR: ' + err)
                error = err
                resolve(error)  // inner promise
              } else {
                log.debug('resilientInvoke CALL ' + service.toUpperCase() + ' on host ' + hostUrl + ' - attempt(' + attempts + ') RESULT: ' + JSON.stringify(body))
                done = true
                resolve(body)  // inner promise
              }
            })
          })
            .then((invokeResult) => {
              log.debug('resilientInvoke ENDS attempt(' + attempts + ') done? ' + done)

              if (done) {
                let functionResult
                switch (invokeResult.dataType) {
                  case 'undefined':
                    functionResult = null
                    break
                  case 'number':
                    functionResult = parseInt(invokeResult.data)
                    break
                  default:
                    functionResult = invokeResult.data  // string or object
                }
                resolve(functionResult) // outer promise
              } else resilientInvoke(done, attempts)
            })
            .catch((e) => {
              log.error('resilientInvoke ' + service.toUpperCase() + ' ERROR: ' + JSON.stringify(e))
            })
        })
      }
      // Ends function forceInvoke
      resilientInvoke(done, attempts).then((result) => {
        resolve(result) // main promise
      })
    })
  }
}

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
        param = []
        break
      case 'number':
        param = [parseInt(req.body.data)]
        break
      case 'object':
        param = Object.keys(req.body.data).map(val => req.body.data[val])
        break
      default:
        param = [req.body.data]// string or object
    }

    param.unshift(session) // add session as first param

    f.apply(null, param)
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
      invokeService('global', 'getCustomers', session)
        .then((customers) => {
          mapCustomers = customers
          return invokeService('global', 'getDevices', session)
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

const initTest = (customers, devices) => {
  return new Promise((resolve, reject) => {
    log = logger.getLogger('session')
    log.debug('session: initTest()')
    mapCustomers = customers
    mapDevices = devices
    let customerTest = getCustomersList()
    initializeCustomer(customerTest, 0).then(() => {
      resolve()
    })
  })
}

module.exports = {
  init,
  getSession,
  getCustomersList,
  manageSession,
  checkSerial,
  getDatabases,
  setAuthorization,
  invokeWrapper,
  // Added for testings
  initTest,
  invokeWrapper,
  registerMethod,
  invokeService
}

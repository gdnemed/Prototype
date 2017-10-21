/* global process, require, module */
// -------------------------------------------------------------------------------------------
// global file (holds all global objects required by any module, ex: api, cfg, eventEmitter, dbs, etc)
// -------------------------------------------------------------------------------------------
const request = require('request')
const events = require('events')
const logger = require('./utils/log')
// const fs = require('fs')

let log
let invokeLocal

// -------------------------------------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------------------------------------
let _evtEmitter
// Events names
const EVT = {
  onEndImport: 'onEndImport', // emitted by 'files' when an import process is finished
  onEntityVersionChange: 'onEntityVersionChange' // emitted by 'logi' when an entity version is increased
}
// Creates an instance of 'EventEmitter' that allows emision and reception of events
// via eventEmitter.emit(...) / eventEmitter.on(...)
const initEvents = () => {
  _evtEmitter = new events.EventEmitter()
}

// -------------------------------------------------------------------------------------------
// CONFIGURATION
// -------------------------------------------------------------------------------------------
let _cfg
const initConfiguration = (params) => {
  return new Promise((resolve, reject) => {
    _cfg = params
    // If url argument passed, configuration must be get from server
    // for instance: http://server:port/api/nodes/:id/services
    if (process.argv.indexOf('--url') !== -1) {
      let url = process.argv[process.argv.indexOf('--url') + 1]
      let apiKey
      if (process.argv.indexOf('--apiKey') !== -1) {
        apiKey = process.argv[process.argv.indexOf('--apiKey') + 1]
      }
      getRemoteConfiguration(url, apiKey)
        .then(resolve)
        .catch(reject)
    } else {
      try {
        /* let home = process.env.HOME
        let routeCfg = home
        log.debug(`Using config file ${routeCfg}`)
        let strConfig = applyEnvVars(fs.readFileSync(routeCfg + '/config.json', 'utf8'))
        _cfg = JSON.parse(strConfig) */
        resolve()
      } catch (err) {
        console.log('ERROR: cannot start Lemuria: ' + err.message)
        process.exit()
      }
    }
  })
}

const getRemoteConfiguration = (url, apiKey) => {
  return new Promise((resolve, reject) => {
    let data = {method: 'GET', url: url}
    if (apiKey) data.headers = {'Authorization': 'APIKEY ' + apiKey}
    request(data, (error, response, body) => {
      if (error) reject(error)
      else {
        let cfg = JSON.parse(body)
        _cfg = {node_id: 1}
        _cfg.id = cfg.id
        for (let i = 0; i < cfg.services.length; i++) {
          _cfg[cfg.services[i].id] = cfg.services[i]
          delete _cfg[cfg.services[i].id].id
        }
        // Server address
        let matcher = url.match('(https?://)([^:^/]*)(:\\d*)?(.*)?')
        let port = matcher[3] ? parseInt(matcher[3].substring(1)) : 80
        _cfg.server = {host: matcher[2], port: port}
        // We add remote access parameters, which are useful for future calls
        _cfg.url = url
        _cfg.apiKey = apiKey
        resolve()
      }
    })
  })
}

/*
const applyEnvVars = (str) => {
  const REGEXP_VAR = /\$[A-Za-z_][A-Za-z_0-9]*\$/g
  let getValForKey = (key) => {
    let newVal = process.env[key.replace(/\$/g, '')]
    if (newVal !== undefined) return newVal
    else return key
  }
  str = str.replace(REGEXP_VAR, getValForKey)
  return str
} */

const init = (params, invokeLocalFunction) => {
  log = logger.getLogger('global')
  log.debug('>> global.init()')
  return new Promise((resolve, reject) => {
    initConfiguration(params)
      .then(() => {
        initEvents()
        invokeLocal = invokeLocalFunction
        appServices.local = getBootServices()
        resolve()
      })
      .catch(reject)
  })
}

/// /////////////////////
/// Services
/// /////////////////////

let taskTimeInterval = 1000 * 5
let appServices = {
  local: [],
  remote: {}
}

/*
 *  List of booted services on the current node process.
 */
const getBootServices = () => {
  let bootServices = _cfg.localServices.split(',')
  if (bootServices[0] === '' && bootServices.length === 1) bootServices = []
  return bootServices
}

/*
 *  Refresh remote services list task.
 */
const initJobReloadServicesList = () => {
  setTimeout(() => {
    getServicesRegistry().then(() => {
      initJobReloadServicesList()
    })
  }, taskTimeInterval)
}

/* Asks registry service for a list of available lemuria services. */
const getServicesRegistry = () => {
  return new Promise((resolve, reject) => {
    if (isLocalService('registry')) resolve()
    else if (_cfg.registry && _cfg.registry.length > 0) {
      let options = {
        'method': 'GET',
        'url': _cfg.registry + '/api/registry/services',
        'headers': {
          'Authorization': 'APIKEY 123' // + apiKey
        },
        'body': {
        },
        'encoding': 'utf8',
        'json': true
      }

      request(options, (err, res, body) => {
        if (err) {
          log.error('REGISTRY service response: ' + err)
          reject(err)
        } else {
          addRemoteServices(body.services)
          taskTimeInterval = parseInt(body.refresh)
          resolve()
        }
      })
    } else {
      log.warn('Registry service URL is unsettled.')
      resolve()
    }
  })
}

/* Call to registry service, to inform which services we give. */
const registerHostedServices = () => {
  return new Promise((resolve, reject) => {
    log.info('Registering services booted.')
    if (isLocalService('registry')) resolve()
    else if (_cfg.registry && _cfg.registry.length > 0) {
      let options = {
        'method': 'POST',
        'url': _cfg.registry + '/api/registry/register',
        'headers': {// TODO: generic API_KEY , needed?
          'Authorization': 'APIKEY 123' // + apiKey
        },
        'body': {
          'service': getBootServices(),
          'address': {
            'protocol': 'http',
            'port': _cfg.apiPort || '8081',
            'server': _cfg.apiHost || '127.0.0.1'
          },
          'environment': process.env.NODE_ENV || 'dev',
          'version': '1.0',
          'time': '',
          'load': '50'
        },
        'encoding': 'utf8',
        'json': true
      }

      request(options, (err, res, body) => {
        if (err) {
          log.error('REGISTRY service response: ' + err)
          reject(err)
        } else {
          addRemoteServices(body.services)
          resolve(body)
        }
      })
    } else {
      log.warn('Registry service URL is unsettled.')
      resolve()
    }
  })
}

const addLocalService = (serviceName) => {
  return new Promise((resolve, reject) => {
    if (!appServices.local.includes(serviceName)) {
      appServices.local.push(serviceName)
    }
    resolve()
  })
}

const addRemoteServices = (serviceList) => {
  if (serviceList) appServices.remote = serviceList
  log.info('Updated remote services on this instance.')
}

const isLocalService = (serviceName) => {
  return appServices.local.includes(serviceName)
}

const loadBalancer = (serviceArray, avoidHost) => {
  let _bestUrl = null
  // TODO: a real balancer...
  // if (serviceArray.length > 0) _bestUrl = serviceArray[0].protocol + '://' + serviceArray[0].host
  if (serviceArray.length > 0) {
    _bestUrl = serviceArray[0].protocol + '://' + serviceArray[0].server + ':' + serviceArray[0].port
  }
  return _bestUrl
}

const getUrlService = (serviceName, avoidHost) => {
  let _url = null
  if (serviceName === 'global') {
    return _cfg.registry
  } else if (appServices.remote.hasOwnProperty(serviceName)) {
    console.log('appServices.remote[serviceName]  ' + JSON.stringify(appServices.remote[serviceName]))
    _url = loadBalancer(appServices.remote[serviceName], avoidHost)
  }
  return _url
}

/*
 *  Returns an object with the correct route and operation on the REST request.
 */
const getMethodRoute = (serviceName, methodName) => {
  let foo = {
    'route': '',
    'method': ''
  }
  if (serviceName === 'state') {
    switch (methodName) {
      case 'newId':
        foo.method = 'GET'
        foo.route = '/api/state/newId'
        break
      case 'newInputId':
        foo.method = 'GET'
        foo.route = '/api/state/newInputId'
        break
      case 'blockType':
        foo.method = 'GET'
        foo.route = '/api/state/blockType'
        break
      case 'releaseType':
        foo.method = 'GET'
        foo.route = '/api/state/releaseType'
        break
      case 'settings':
        foo.method = 'GET'
        foo.route = '/api/state/settings'
        break
      default:
        throw new Error('Invalid method name: ' + serviceName + '.' + methodName)
    }
  } else if (serviceName === 'global') {
    switch (methodName) {
      case 'getCustomers':
        foo.method = 'GET'
        foo.route = '/api/global/customers'
        break
      case 'getDevices':
        foo.method = 'GET'
        foo.route = '/api/global/devices'
        break
    }
  } else {
    throw new Error('Invalid service name: ' + serviceName)
  }

  return foo
}

/*
 *  All service calls are executed using this method.
 *  Depending on whether the service is available locally, or if it is an external service,
 *  this function will call the corresponding endPoint by returning a promise with the result.
 */
const invokeService = (service, methodName, session, parameters) => {
  if (isLocalService(service)) return invokeLocal(service, methodName, session, parameters)
  else {
    return new Promise((resolve, reject) => {
      let error = {}; let done = false; let attempts = 0; let hostUrl = ''
      let attemptedUrls = []  // List of requested hosts to resolve invoke method
      let param = getMethodRoute(service, methodName)

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

            hostUrl = getUrlService(service, attemptedUrls)
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
              log.debug('resilientInvoke ENDS attempt(' + attempts + ')')
              log.info('********** INVOKED METHOD DATA RECEIVED ************')
              log.info('dataType -> ' + invokeResult.dataType)
              log.info('data     -> ' + JSON.stringify(invokeResult.data))

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

/// /////////////////////
/// END
/// /////////////////////

module.exports = {
  init,
  // Events names & event emitter
  EVT,
  getEventEmitter: () => _evtEmitter,
  // Config
  getConfig: () => _cfg,
  /// Services
  addLocalService,
  addRemoteServices,
  invokeService,
  getServicesRegistry,
  getBootServices,
  isLocalService,
  registerHostedServices,
  initJobReloadServicesList
}

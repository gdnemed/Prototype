/* global process, require, module */
// -------------------------------------------------------------------------------------------
// global file (holds all global objects required by any module, ex: api, cfg, eventEmitter, dbs, etc)
// -------------------------------------------------------------------------------------------

const events = require('events')
const request = require('request')
const logger = require('./utils/log')
const perf = require('./performance')

let log
const methods = {}

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
    _cfg.nodeId = _cfg.nodeId || (_cfg.apiHost + ':' + _cfg.apiPort)
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
        // _cfg = {node_id: 1} Do not replace all config data... only required.
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

const init = (params) => {
  log = logger.getLogger('global')
  log.debug('>> global.init()')
  return new Promise((resolve, reject) => {
    initConfiguration(params)
      .then(() => {
        initEvents()
        appServices.local = getBootServices()
        resolve()
      })
      .catch(reject)
  })
}

const invokeLocal = (service, methodName, session, parameters) => {
  return new Promise((resolve, reject) => {
    log.debug('LEMURIA invokeLocal: ' + service + '.' + methodName)

    let param
    switch (typeof (parameters)) {
      case 'undefined':
        param = []
        break
      case 'number':
        param = [parseInt(parameters)]
        break
      case 'object':
        param = Object.keys(parameters).map(val => parameters[val])
        break
      default:
        param = [parameters]// string or object
    }

    param.unshift(session) // add session as first param

    let f = getLocalMethod(service, methodName)
    if (f) {
      f.apply(null, param)
        .then(resolve).catch(reject)
    } else {
      reject(new Error('Invoked service method does not exists: ' + service + '.' + methodName))
    }
  })
}

const getLocalMethod = (serviceName, functionName) => {
  let s = methods[serviceName]
  if (s) {
    let f = s[functionName]
    if (f) return f.localFunction
  }
}

/*
 *  Returns an object with the correct route and operation on the REST request.
 */
const getMethodRoute = (serviceName, functionName) => {
  let s = methods[serviceName]
  if (s) {
    let f = s[functionName]
    if (f) return f
    else throw new Error('Invalid method name: ' + serviceName + '.' + functionName)
  } else throw new Error('Invalid service name: ' + serviceName)
}

/// /////////////////////
/// Services
/// /////////////////////

let appServices = {
  local: [],
  remote: {}
}

/*
 *  List of booted services on the current node process.
 */
const getBootServices = () => {
  _cfg.localServices = (typeof _cfg.localServices === 'undefined') ? '' : _cfg.localServices
  let bootServices = _cfg.localServices.split(',')
  if (bootServices[0] === '' && bootServices.length === 1) bootServices = []
  return bootServices
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
          'load': perf.getStatistics()
        },
        'encoding': 'utf8',
        'json': true
      }
      request(options, (err, res, body) => {
        let interval = 5000                    // if request error interval
        if (body && body.refresh) {
          interval = parseInt(body.refresh)
        }
        // Next call to registry, with or without server response
        setTimeout(() => {
          registerHostedServices()
        }, interval)
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
  log.info('Updated remote services on this instance. ' + _cfg.nodeId)
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
    _url = loadBalancer(appServices.remote[serviceName], avoidHost)
  }
  return _url
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
  getServicesRegistry,
  getBootServices,
  isLocalService,
  registerHostedServices,
  getUrlService,
  invokeLocal,
  getMethodRoute,
  getMethods: () => methods
}

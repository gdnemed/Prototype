/* global process, require, module */
// -------------------------------------------------------------------------------------------
// global file (holds all global objects required by any module, ex: api, cfg, eventEmitter, dbs, etc)
// -------------------------------------------------------------------------------------------
const request = require('request')
const events = require('events')
const logger = require('./utils/log')
const fs = require('fs')

let log

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
const initConfiguration = () => {
  return new Promise((resolve, reject) => {
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
        let home = process.env.HOME
        let routeCfg = home
        log.debug(`Using config file ${routeCfg}`)
        let strConfig = applyEnvVars(fs.readFileSync(routeCfg + '/config.json', 'utf8'))
        _cfg = JSON.parse(strConfig)
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

const applyEnvVars = (str) => {
  const REGEXP_VAR = /\$[A-Za-z_][A-Za-z_0-9]*\$/g
  let getValForKey = (key) => {
    let newVal = process.env[key.replace(/\$/g, '')]
    if (newVal !== undefined) return newVal
    else return key
  }
  str = str.replace(REGEXP_VAR, getValForKey)
  return str
}

const init = () => {
  log = logger.getLogger('global')
  log.debug('>> global.init()')
  return new Promise((resolve, reject) => {
    initConfiguration()
      .then(() => {
        initEvents()
        addLocalService('global') // JDS
        resolve()
      })
      .catch(reject)
  })
}

/// /////////////////////
/// Services
/// /////////////////////

let appServices = {
  local: [],
  remote: {}
}

const callRegistry = () => {
  // TODO: this well done...
  let options = {
    'method': 'GET',
    'url': 'http://127.0.0.1:8081/api/nodes/services',
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
      log.error('Service REGISTRY on 127.0.0.1:8081: ' + err)
    } else {
      log.info('Service REGISTRY response === ' + JSON.stringify(body))
      addRemoteServices(body.services)
    }
  })
}

const hardCodedAddState = () => {
  // TODO: this well done...
  let options = {
    'method': 'POST',
    'url': 'http://127.0.0.1:8081/api/nodes/register',
    'headers': {
      'Authorization': 'APIKEY 123' // + apiKey
    },
    'body': {
      'service': ['state'],
      'address': {
        'protocol': 'http',
        'port': '8081',
        'server': '127.0.0.1'
      },
      'environment': 'dev',
      'version': '1.0',
      'time': '',
      'load': '50'
    },
    'encoding': 'utf8',
    'json': true
  }

  request(options, (err, res, body) => {
    if (err) {
      log.error('Service REGISTRY -> STATE: ' + err)
    } else {
      log.info('Service REGISTRY -> STATE response === ' + JSON.stringify(body))
      addRemoteServices(body.services)
    }
  })
}

const addLocalService = (serviceName) => {
  if (!appServices.local.includes(serviceName)) appServices.local.push(serviceName)

  log.info('UPDATED appServices: ' + JSON.stringify(appServices))
}

const addRemoteServices = (serviceList) => {
  if (serviceList) appServices.remote = serviceList

  log.info('UPDATED appServices: ' + JSON.stringify(appServices))
}

const isLocalService = (serviceName) => {
  return appServices.local.includes(serviceName)
}

const loadBalancer = (serviceArray, avoidHost) => {
  let _bestUrl = null
  // TODO: a real balancer...
  if (serviceArray.length > 0) _bestUrl = serviceArray[0].host
  return _bestUrl
}

const getUrlService = (serviceName, avoidHost) => {
  let _url = null
  if (appServices.remote.hasOwnProperty(serviceName)) {
    _url = loadBalancer(appServices.remote[serviceName], avoidHost)
  }
  return _url
}

const getMethodRoute = (serviceName, methodName) => {
  let methodRoute

  if (serviceName === 'state') {
    switch (methodName) {
      case 'newId':
        methodRoute = '/api/state/?????'
        break
      case 'newInputId':
        methodRoute = '/api/state/?????'
        break
      case 'blockType':
        methodRoute = '/api/state/?????'
        break
      case 'releaseType':
        methodRoute = '/api/state/?????'
        break
      case 'settings':
        methodRoute = '/api/state/settings'
        break
      default:
        throw new Error('Invalid method name: ' + serviceName + '.' + methodName)
    }
  } else if (serviceName === 'coms') {

  } else if (serviceName === 'foo') {

  } else {
    throw new Error('Invalid service name: ' + serviceName)
  }

  return methodRoute
}

const invokeService = (service, methodName, session, parameters) => {
  // TODO: static methods as promise?
  if (isLocalService(service)) {
    switch (service) {
      case 'state':
        // return state[methodName](session, parameters)
        return null
      case 'otherService':
        return null
      default:
        throw new Error('Invoked service method does not exists: ' + service + '.' + methodName)
    }
  } else {
    let route = getMethodRoute(service, methodName)

    return new Promise((resolve, reject) => {
      let result, error
      let done = false
      let attemptedUrls = []  // List of requested hosts to resolve invoke method
      let hostUrl = getUrlService(service, attemptedUrls)
      attemptedUrls.push(hostUrl)

      // Loop on available type services
      while (!done) {
        // Get host and log usage.
        hostUrl = getUrlService(service, attemptedUrls)
        if (attemptedUrls.includes(hostUrl)) break
        attemptedUrls.push(hostUrl)

        let options = {
          'method': 'GET',
          'url': hostUrl + route,
          'headers': {
            'Authorization': 'APIKEY 123' // + apiKey
          },
          'body': {
            'data': parameters,
            'session': session
          },
          'encoding': 'utf8',
          'json': true
        }

        request(options, (err, res, body) => {
          if (err) {
            log.error('Service ' + service.toUpperCase() + ' on  host ' + hostUrl + ': ' + err)
            error = err
          } else {
            result = JSON.parse(body)
            done = true
          }
        })
        // Keeps looping
      }

      if (done) {
        resolve(result)
      } else {
        reject(error)
      }
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
  getUrlService,
  invokeService,
  callRegistry,
  hardCodedAddState
}

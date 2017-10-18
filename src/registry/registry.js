// -------------------------------------------------------------------------------------------
// Registry module.
// -Implements API calls over registry services.
//
//    list = {
//      'IP:PORT': {
//        'service1': { ... },
//        'service2': { ... }
//      },
//      'IP2:PORT': { ... }
//    }
//
// -------------------------------------------------------------------------------------------

const http = require('http')
const https = require('https')
const logger = require('../utils/log')
const httpServer = require('../httpServer')
const g = require('../global')

let log
let servicesList = {}
let heartBeatInterval = 1000             // Interval pulse to request status on listed services
let clientSideInterval = 1000 * 60 * 5   // Parameter sent to the services.
let ttl = 1000 * 60 * 5                  // Time to live of service entries in registry list.
let forceHostClean = true                // If it's true, on heartbeat request error, clean all services entries on that host.

const serviceType = {
  'host': '',              // IP:PORT
  'service': '',           // Service Type
  'environment': '',       // Service environment
  'address': {             // Service address data
    'protocol': '',
    'server': '',
    'port': ''
  },
  'request': {             // Request address data
    'protocol': '',
    'server': '',
    'port': ''
  },
  'version': '',           // Service Version
  'time': '',              // Service entry creation timestamp
  'load': ''               // Service server workload data
}

/**********************************
 Service Configuration
 **********************************/

const isStandalone = () => {
  return 0
}

const loadConfig = (cfg) => {
  if (cfg) {
    heartBeatInterval = cfg.heartBeatInterval || heartBeatInterval
    clientSideInterval = cfg.clientSideInterval || clientSideInterval
    ttl = cfg.ttl || ttl
  }
}

const emptyList = () => {
  servicesList = {}
}

// TESTING
// Checking heartbeat testing function
const responseCheckTest = (req, res) => {
  let response = {
    'host': '127.0.0.1:8081',
    'service': ['logic', 'com', 'test'],
    'environment': 'dev',
    'address': {
      'protocol': 'http',
      'server': '127.0.0.1',
      'port': '8081'
    },
    'request': {
      'protocol': 'http',
      'server': '127.0.0.1',
      'port': '8081'
    },
    'version': '1.1',
    'time': '',
    'load': '75'
  }

  // res.jsonp(response)
  res.jsonp({'service': []})
}

/*************************************************
 Cycles && Services heartbeating
 *************************************************/

/*
 *  Make a status request to each of the registered services.
 *  Then recall the parent function to create a recursive loop.
 */
const heartBeat = () => {
  setTimeout(() => {
    for (const host of Object.keys(servicesList)) {
      log.info('Heartbeat: ' + host)
      heartBeatCheck(host, heartBeatUpdate)
    }
    heartBeat()
  }, heartBeatInterval)
}

const heartBeatCheck = (server, callback) => {
  /*
  let protocol = server.protocol === 'https' ? https : http
  let pos = server.lastIndexOf(':')
  let IP = server.substring(0, pos)
  let PORT = server.substring(pos + 1)
  */

  let protocol = server.address.protocol === 'https' ? https : http
  let IP = server.address.server
  let PORT = server.address.port

  let options = {
    'host': IP,
    'port': PORT,
    'path': '/api/nodes/check?',
    'method': 'GET',
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'APIKEY 123'
    }
  }

  let req = protocol.request(options, (res) => {
    let output = ''
    res.setEncoding('utf8')

    res.on('data', (chunk) => {
      output += chunk
    })

    res.on('end', () => {
      let obj = JSON.parse(output)
      if (callback && typeof callback === 'function') {
        callback(res.statusCode, obj)
      }
    })
  })

  req.on('error', (err) => {
    log.error('Heartbeat ' + options.host + ' ERROR: ' + err + '. DELETING ENTRY !!!')
    if (forceHostClean) {
      deleteHost(options)
    }
  })

  req.end()
}

const heartBeatUpdate = (status, response) => {
  log.info('HeartBeat response: ' + status + ' ' + JSON.stringify(response))
  response.time = Date.now()
  updateServices(response)
}

/********************************************************
 Clean expired entries on service list.
 ********************************************************/

const cleanListJob = () => {
  setTimeout(() => {
    cleanExpiredEntries()
    cleanListJob()
  }, ttl)
}

const cleanExpiredEntries = () => {
  let rightNow = Date.now()
  log.debug('Cleaning expired entries with TTL: ' + ttl)

  for (const host of Object.keys(servicesList)) {
    for (const serviceType of Object.keys(servicesList[host])) {
      let expirationTime = servicesList[host][serviceType].time + ttl
      let expirationDate = new Date(expirationTime)

      if (rightNow > expirationTime) {
        log.info('Deleting outdated service ' + serviceType.toUpperCase() + ' at address ' + host + '. Expiration time: ' + expirationDate.toJSON() + '.')
        deleteService(servicesList[host][serviceType], serviceType)
      }
    }
  }
}

/**********************************
 Registry actions
 **********************************/

const listAll = (req, res) => {
  log.debug('New list request.')
  getAllServices(true)
    .then((allServices) => {
      return res.status(200).jsonp(allServices)
    })
}

const register = (req, res) => {
  log.debug('New register request.')
  addServiceEntry(req)
    .then(getAllServices)
    .then((allServices) => {
      return res.status(200).jsonp(allServices)
    })
}

const unRegister = (req, res) => {
  log.debug('New unregister request.')
  removeServiceEntry(req)
    .then(getAllServices)
    .then((allServices) => {
      return res.status(200).jsonp(allServices)
    })
}

const removeServiceEntry = (req) => {
  log.debug('removeService')

  return new Promise((resolve, reject) => {
    checkRequestData(req)
      .then((serviceEntry) => {
        deleteServices(serviceEntry)
      })
      .then(resolve)
      .catch((e) => {
        log.error(e.message)
        reject(e)
      })
  })
}

const addServiceEntry = (req) => {
  log.debug('addService')

  return new Promise((resolve, reject) => {
    checkRequestData(req)
      .then((serviceEntry) => {
        checkServiceAddress(serviceEntry)
          .then((serviceEntry) => {
            addServices(serviceEntry)
          })
          .then(resolve)
          .catch((e) => {
            log.error(e.message)
            reject(e)
          })
      })
      .catch((e) => {
        log.error(e.message)
        reject(e)
      })
  })
}

const checkRequestData = (req) => {
  return new Promise((resolve, reject) => {
    log.debug('checking request data...')

    if ((!req.body.hasOwnProperty('services')) && (!req.body.hasOwnProperty('service'))) reject(new Error('Missing SERVICE(s) property'))
    if (!req.body.hasOwnProperty('environment')) reject(new Error('Missing ENV property'))
    if (!req.body.hasOwnProperty('address')) reject(new Error('Missing ADDRESS property'))
    if (!req.body.address.hasOwnProperty('protocol')) reject(new Error('Missing PROTOCOL property'))
    if (!req.body.address.hasOwnProperty('server')) reject(new Error('Missing SERVER property'))
    if (!req.body.address.hasOwnProperty('port')) reject(new Error('Missing PORT property'))

    let serviceEntry = Object.assign({}, serviceType)

    serviceEntry.service = req.body.services || req.body.service
    serviceEntry.environment = req.body.environment || 'dev'
    serviceEntry.version = req.body.version || '1.0'
    serviceEntry.time = Date.now()
    serviceEntry.load = req.body.load || '50'
    serviceEntry.address.protocol = req.body.address.protocol
    serviceEntry.address.server = req.body.address.server
    serviceEntry.address.port = req.body.address.port

    // OOOOOOOOOOJOOOOOOOOOOOOOOOO Revisar el caso extraño de levantar dos servicios en la misma maquina mismo puerto...
    console.log('REGISTRY req.headers.host >>>> ' + req.headers.host)

    // Request data
    serviceEntry.host = /*req.headers.host || */ (serviceEntry.address.server + ':' + serviceEntry.address.port)

    console.log('serviceEntry.host' + serviceEntry.host)
    let pos = serviceEntry.host.lastIndexOf(':')
    serviceEntry.request.protocol = req.protocol || serviceEntry.address.protocol
    serviceEntry.request.server = req.headers.host.substring(0, pos)
    serviceEntry.request.port = req.headers.host.substring(pos + 1)

    if ((serviceEntry.address.server !== serviceEntry.request.server) ||
      (serviceEntry.address.port !== serviceEntry.request.port)) {
      log.warn('Service and request addresses are different!')
    }

    log.info(JSON.stringify(serviceEntry))
    resolve(serviceEntry)
  })
}

const checkServiceAddress = (service) => {
  return new Promise((resolve, reject) => {
    log.debug('check request address...')

    if (!service) reject(new Error('Missing service object to test'))

    let protocol = service.request.protocol === 'https' ? https : http
    protocol.get({
      /*host: service.request.server,
      port: service.request.port*/
      host: service.address.server,
      port: service.address.port
    }, (res) => {
      resolve(service)
    }).on('error', (err) => {
      log.error(err.message)
      reject(new Error('Address unreachable: ' + service.request.server + ':' + service.request.server))
    })
  })
}

/************************************************************
 Service List Operations
 ************************************************************/
/*
 * Returns list of available services with the following structure:
 *   {
 *      services: {
 *         'serviceType': [{server: '127.0.0.1', port: 8081, protocol: 'https'}],
 *         ...
 *      }
 *   }
 */

const getAllServices = (detailed) => {
  return new Promise((resolve, reject) => {
    let currentServices = {
      'refresh': clientSideInterval,
      'services': listServices(detailed)
    }
    resolve(currentServices)
  })
}

const listServices = (detailed) => {
  let list = {}

  for (const host of Object.keys(servicesList)) {
    for (const serviceType of Object.keys(servicesList[host])) {
      if (!list.hasOwnProperty(serviceType)) list[serviceType] = []

      let data = {
        'host': servicesList[host][serviceType].host,
        'environment': servicesList[host][serviceType].environment,
        'server': servicesList[host][serviceType].address.server,
        'port': servicesList[host][serviceType].address.port,
        'protocol': servicesList[host][serviceType].address.protocol
      }

      if (detailed) {
        data.version = servicesList[host][serviceType].version
        data.time = servicesList[host][serviceType].time
        data.load = servicesList[host][serviceType].load
      }

      list[serviceType].push(data)
    }
  }

  return list
}

/*
 *  Atomic and batch operations on Services List
 *  The service object sended on request can contain an array or a string.
 *  Functions must be able to use both types of data
 *
 */

/// ////////////////////
//
// Host Operations
//
/// ////////////////////

const existsHost = (service) => {
  return servicesList.hasOwnProperty(service.host)
}

const addHost = (service) => {
  if (!existsHost(service)) servicesList[service.host] = {}
}

const deleteHost = (service) => {
  if (existsHost(service)) delete (servicesList[service.host])
}

const updateHost = (service) => {
  updateServices(service)
}

/// ////////////////////
//
//  Service Atomic Operations
//
/// ////////////////////

const existService = (host, service) => {
  if (servicesList.hasOwnProperty(host)) {
    return servicesList[host].hasOwnProperty(service)
  } else {
    return false
  }
}

const addService = (service, forceType) => {
  log.debug('addService on ' + service.host + '. Type: ' + service.service + ' Forced: ' + forceType)

  let o = Object.assign({}, service)

  if (forceType) {
    o.service = forceType
  }

  addHost(o)
  servicesList[o.host][o.service] = o
}

const deleteService = (service, forceType) => {
  log.warn('deleteService on ' + service.host + '. Type: ' + service.service + '. Forced: ' + forceType)

  let o = Object.assign({}, service)

  if (forceType) o.service = forceType

  if (existService(o.host, o.service)) {
    delete (servicesList[o.host][o.service])

    if (Object.keys(servicesList[o.host]).length === 0) deleteHost(o.host)
  }
}

const updateService = (service, forceType) => {
  log.debug('updateService on ' + service.host + '. Type: ' + service.service + '. Forced: ' + forceType)

  let o = Object.assign({}, service)
  let previousService = {}

  if (forceType) {
    o.service = forceType
  }

  if (!existService(o.host, o.service)) {
    addService(service, o.service)
  } else {
    previousService = Object.assign({}, servicesList[o.host][o.service])
    servicesList[o.host][o.service] = Object.assign({}, previousService, o)
  }
}

/// ////////////////////
//
// Service Batch Operations
//
/// ////////////////////

const existServices = (service) => {
  let severalServices = (typeof service.service === 'string') ? 0 : 1
  let existServices = true

  // On an IP:PORT can only be running one instance of a service.
  if (!severalServices) {
    existServices = existService(service.host, service.service)
  } else {
    for (let serviceType of service.service) {
      existServices = existService(service.host, serviceType)

      if (!existServices) break  // all or none
    }
  }

  return existServices
}

const addServices = (service) => {
  let severalServices = (typeof service.service === 'string') ? 0 : 1

  // On an IP:PORT can only be running one instance of a service.
  if (!severalServices) {
    addService(service, service.service)
  } else {
    for (let serviceType of service.service) {
      addService(service, serviceType)
    }
  }
}

const deleteServices = (service) => {
  let severalServices = (typeof service.service === 'string') ? 0 : 1

  if (!severalServices) {
    deleteService(service, service.service)
  } else {
    for (let serviceType of service.service) {
      deleteService(service, serviceType)
    }
  }
}

const updateServices = (service) => {
  if (service.hasOwnProperty('service')) {
    let severalServices = (typeof service.service === 'string') ? 0 : 1

    if (!severalServices) {
      updateService(service, service.service)
    } else {
      for (let serviceType of service.service) {
        updateService(service, serviceType)
      }
    }
  }
}

/**********************************
 Service Init
 **********************************/

const init = () => {
  return new Promise((resolve, reject) => {
    let bootServices = g.getBootServices()
    let bootUpService = (bootServices.length === 0) || (bootServices.includes('registry')) ? 1 : 0

    if (bootUpService) {
      ttl = 1000 * 60 * 60                        // TESTING
      heartBeatInterval = 1000 * 60 * 60          // TESTING
      log = logger.getLogger('registry')
      log.debug('>> registry init()')
      g.addLocalService('registry').then(() => {
        httpServer.getApi().post('/api/registry/register', (req, res) => register(req, res))
        httpServer.getApi().delete('/api/registry/unregister', (req, res) => unRegister(req, res))
        httpServer.getApi().get('/api/registry/services', (req, res) => listAll(req, res))
        httpServer.getApi().get('/api/registry/check', (req, res) => responseCheckTest(req, res))
        loadConfig()
        emptyList()
        heartBeat()
        cleanListJob()
        resolve()
      })
    } else resolve()
  })
}

module.exports = {
  init
}

// TESTING
// if (isStandalone) init()

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
let nodesList = {}
let heartBeatInterval = 1000 * 60 * 5    // Interval pulse to request status on listed services
let clientSideInterval = 1000 * 60 * 5   // Parameter sent to the services.

const serviceType = {
  'host': '',              // IP:PORT
  'service': '',           // Service Type
  'environment': '',       // Service environment
  'address': {             // Service address data
    'protocol': '',
    'server': '',
    'port': ''
  },
  'version': '',           // Service Version
  'time': '',              // Service entry creation timestamp
  'load': ''               // Service server workload data
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
    for (const host of Object.keys(nodesList)) {
      log.info('Heartbeat: ' + host)
      heartBeatCheck(nodesList[host])
    }
    heartBeat()
  }, heartBeatInterval)
}

const heartBeatCheck = (node) => {
  let protocol = node.address.protocol === 'https' ? https : http
  let IP = node.address.server
  let PORT = node.address.port

  let options = {
    'host': IP,
    'port': PORT,
    'path': '/api/registry/check',
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
      // let obj = JSON.parse(output)
      log.info('HeartBeat ok for ' + node.host)
      node.time = Date.now()
    })
  })

  req.on('error', (err) => {
    log.error('Heartbeat ' + options.host + ' ERROR: ' + err + '. DELETING ENTRY !!!')
    deleteNode(options.host)
  })

  req.end()
}

/**********************************
 Registry actions
 **********************************/

const listAll = (req, res) => {
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
      g.addRemoteServices(allServices.services)
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
      .then((node) => {
        deleteNode(node)
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
      .then((node) => {
        checkServiceAddress(node)
          .then((node) => {
            updateNode(node)
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

    // Request data
    serviceEntry.host = serviceEntry.address.server + ':' + serviceEntry.address.port

    log.info(JSON.stringify(serviceEntry))
    resolve(serviceEntry)
  })
}

const checkServiceAddress = (service) => {
  return new Promise((resolve, reject) => {
    log.debug('check request address...')

    if (!service) reject(new Error('Missing service object to test'))

    let protocol = service.address.protocol === 'https' ? https : http
    protocol.get({
      host: service.address.server,
      port: service.address.port
    }, (res) => {
      resolve(service)
    }).on('error', (err) => {
      log.error(err.message)
      reject(new Error('Address unreachable: ' + service.address.server + ':' + service.address.server))
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

  for (const host of Object.keys(nodesList)) {
    for (let i = 0; i < nodesList[host].service.length; i++) {
      let serviceType = nodesList[host].service[i]
      if (!list.hasOwnProperty(serviceType)) list[serviceType] = []

      let data = {
        'host': nodesList[host].host,
        'environment': nodesList[host].environment,
        'server': nodesList[host].address.server,
        'port': nodesList[host].address.port,
        'protocol': nodesList[host].address.protocol
      }

      if (detailed) {
        data.version = nodesList[host].version
        data.time = nodesList[host].time
        data.load = nodesList[host].load
      }
      list[serviceType].push(data)
    }
  }
  // Add our own services
  let l = g.getBootServices()
  for (let i = 0; i < l.length; i++) {
    if (l[i] !== 'registry') {
      let data = {
        'host': g.getConfig().apiHost,
        'environment': process.env.NODE_ENV || 'dev',
        'server': g.getConfig().apiHost,
        'port': g.getConfig().apiPort,
        'protocol': 'http'
      }
      if (detailed) {
        data.version = '1.0'
        data.time = ''
        data.load = '50'
      }
      if (!list[l[i]]) list[l[i]] = []
      list[l[i]].push(data)
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

const deleteNode = (host) => {
  log.warn('deleteNode on ' + host)
  delete (nodesList[host])
}

const updateNode = (node) => {
  if (nodesList[node.host]) {
    node.time = nodesList[node.host].time
    log.debug('updateNode on ' + node.host)
  } else {
    log.debug('addNode on ' + node.host)
  }
  nodesList[node.host] = node
}

/**********************************
 Service Init
 **********************************/

const init = () => {
  return new Promise((resolve, reject) => {
    if (g.isLocalService('registry')) {
      log = logger.getLogger('registry')
      log.debug('>> registry init()')
      g.addLocalService('registry').then(() => {
        httpServer.getApi().post('/api/registry/register', (req, res) => register(req, res))
        httpServer.getApi().delete('/api/registry/unregister', (req, res) => unRegister(req, res))
        httpServer.getApi().get('/api/registry/services', (req, res) => listAll(req, res))
        heartBeat()
        resolve()
      })
    } else resolve()
  })
}

module.exports = {
  init
}

// -------------------------------------------------------------------------------------------
// Registry module.
// -Implements API calls over registry services.
// -------------------------------------------------------------------------------------------

const http = require('http')
const https = require('https')
const logger = require('../utils/log')
const httpServer = require('../httpServer')
const g = require('../global')
const defaults = require('../defaults').addDefaults()

let log
let servicesList = {}
let beats = 0                            // Beats counter ... remove it later!!!
let heartBeatInterval = 1000             // Interval pulse to request status on listed services
let clientSideInterval = 1000 * 60 * 5   // Parameter sent to the services.
let ttl = 1000 * 60 * 5                  // Time to live of service entries in registry list.

ttl = 1000 * 5 // 5 segundos  para testing

const loadConfig = (cfg) => {
  if (cfg) {
    heartBeatInterval = cfg.heartBeatInterval || heartBeatInterval
    clientSideInterval = cfg.clientSideInterval || clientSideInterval
  }
}

const emptyList = () => {
  servicesList = {}
}

/**********************************
 Registry request validation
 **********************************/

const isValidService = (srv) => {
  return new Promise((resolve, reject) => {
    // TODO: others validations ... review waterfall
    checkData(srv)
      .then(
        // HTTP(s) Connection test before add register
        checkAddress({
          'host': srv.requestIP,
          'port': srv.requestPort,
          'protocol': srv.address.protocol
        })
          .catch((e) => {
            log.error(e.message)
            reject(e)
          })
      )
      .then(resolve())
      .catch((e) => {
        log.error(e.message)
        reject(e)
      })
  })
}

const checkData = (srv) => {
  return new Promise((resolve, reject) => {
    log.debug('checkData')
    if (!srv.hasOwnProperty('host')) reject(new Error('Missing HOST property'))
    if (!srv.hasOwnProperty('service')) reject(new Error('Missing SERVICE property'))
    if (!srv.hasOwnProperty('environment')) reject(new Error('Missing ENV property'))
    if (!srv.hasOwnProperty('address')) reject(new Error('Missing ADDRESS property'))
    if (!srv.address.hasOwnProperty('protocol')) reject(new Error('Missing PROTOCOL property'))
    if (!srv.address.hasOwnProperty('server')) reject(new Error('Missing SERVER property'))
    if (!srv.address.hasOwnProperty('port')) reject(new Error('Missing PORT property'))

    let pos = srv.host.lastIndexOf(':')
    srv.requestIP = srv.host.substring(0, pos)
    srv.requestPort = srv.host.substring(pos + 1)

    if ((srv.address.server !== srv.requestIP) || (srv.address.port !== srv.requestPort)) {
      // What happen here? ...
      // srv.host = srv.address.server + ':' + srv.address.port
      null
    }
    log.info(JSON.stringify(srv))
    resolve()
  })

}

const checkAddress = (address) => {
  return new Promise((resolve, reject) => {
    log.debug('checkAddress')

    if (!address) reject(new Error('Missing ADDRESS to test'))

    let protocol = address.protocol === 'https' ? https : http
    protocol.get({
      host: address.host,
      port: address.port
    }, (res) => {
      resolve(res)
    }).on('error', (err) => {
      log.error(err.message)
      reject(new Error('Address unreachable: ' + address.host + ':' + address.port))
    })
  })
}

/**********************************
 ADD Service
 **********************************/

const addService = (srv) => {
  log.debug('addService: ' + JSON.stringify(srv))

  return new Promise((resolve, reject) => {
    isValidService(srv).then(() => {
      let existsHost = (!servicesList.hasOwnProperty(srv.host)) ? 0 : 1
      let severalServices = (typeof srv.service === 'string') ? 0 : 1
      let finalService = {
        'host': srv.host,
        'reqIP': srv.requestIP,
        'reqPort': srv.requestPort,
        'environment': srv.environment,
        'address': {
          'protocol': srv.address.protocol,
          'port': srv.address.port,
          'server': srv.address.server
        },
        'version': srv.version || '1.0',
        'time': Date.now(),
        'load': srv.load || '50'
      }

      if (!existsHost) servicesList[srv.host] = {}

      // On an IP:PORT can only be running one instance of a service.
      if (!severalServices) {
        servicesList[srv.host][srv.service] = finalService
      } else {
        for (let serviceType of srv.service) {
          servicesList[srv.host][serviceType] = finalService
        }
      }
      resolve()
    })
  })
}

const findService = (srvName) => {
  return
}

const removeService = () => {
  return
}

const checkService = () => {
  return
}

/*
 * Returns list of available services with the following structure:
 *   {
 *      services: {
 *         'serviceType': [{server: '127.0.0.1', port: 8081, protocol: 'https'}],
 *         ...
 *      }
 *   }
 */
const getAllServices = (opts) => {

  return new Promise((resolve, reject) => {

    let currentServices = {
      'refresh': clientSideInterval,
      'services': {}
    }

    for (const host of Object.keys(servicesList)) {
      for (const serviceType of Object.keys(servicesList[host])) {
        if (!currentServices.services.hasOwnProperty(serviceType)) currentServices.services[serviceType] = []

        currentServices.services[serviceType].push({
          'host': servicesList[host][serviceType].host,
          'environment': servicesList[host][serviceType].environment,
          'server': servicesList[host][serviceType].address.server,
          'port': servicesList[host][serviceType].address.port,
          'protocol': servicesList[host][serviceType].address.protocol
        })
      }
    }
    log.info('getAllServices: ' + JSON.stringify(currentServices))
    resolve(currentServices)
  })
}

const register = (req, res) => {

  // logRequest(req)

  let newService = req.body
  newService.host = req.headers.host

  addService(newService)
    .then(getAllServices)
    .then((allServices) => {
      return res.status(200).jsonp(allServices)
    })
}




const addService = (srv) => {
  log.debug('addService: ' + JSON.stringify(srv))

  return new Promise((resolve, reject) => {
    isValidService(srv).then(() => {
      let existsHost = (!servicesList.hasOwnProperty(srv.host)) ? 0 : 1
      let severalServices = (typeof srv.service === 'string') ? 0 : 1
      let finalService = {
        'host': srv.host,
        'reqIP': srv.requestIP,
        'reqPort': srv.requestPort,
        'environment': srv.environment,
        'address': {
          'protocol': srv.address.protocol,
          'port': srv.address.port,
          'server': srv.address.server
        },
        'version': srv.version || '1.0',
        'time': Date.now(),
        'load': srv.load || '50'
      }

      if (!existsHost) servicesList[srv.host] = {}

      // On an IP:PORT can only be running one instance of a service.
      if (!severalServices) {
        servicesList[srv.host][srv.service] = finalService
      } else {
        for (let serviceType of srv.service) {
          servicesList[srv.host][serviceType] = finalService
        }
      }
      resolve()
    })
  })
}



const unRegister = (req, res) => {




  return new Promise((resolve, reject) => {

    if (!req.body.hasOwnProperty('service')) reject(new Error('Missing SERVICE property'))

    let damnedService = req.body
    damnedService.host = req.headers.host
    damnedService.severalServices = (typeof damnedService.service === 'string') ? 0 : 1


  })




  return res.status(200)
}

const responseCheckTest = (req, res) => {
  log.info('responseCheckTest')
  let respose = {
    'message': "Yeah... I'm still alive"
  }
  res.jsonp(respose)
}

const doCheck = (server, callback) => {
  log.debug('doCheck of ' +  JSON.stringify(server))

  let protocol = server.protocol === 'https' ? https : http
  let pos = server.lastIndexOf(':')
  let IP = server.substring(0, pos)
  let PORT = server.substring(pos + 1)

  let options = {
    host: IP,
    port: PORT,
    path: '/api/nodes/check?',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'APIKEY 123'
    }
  }

  let req = protocol.request(options, (res) => {
    log.info('ping ' + options.host + ':' + options.port)
    let output = ''
    res.setEncoding('utf8')

    res.on('data', (chunk) => {
      output += chunk
    })
    req.on('error', (err) => {
      // TODO: remove HOST node
      console.log(err)
    })
    res.on('end', () =>  {
      // TODO: update HOST data
      let obj = JSON.parse(output)
      if (callback && typeof callback === "function") {
        callback(res.statusCode, obj)
      }
    })
  })

  req.end()

  //return res.status(200)
}
/*
 *  Make a status request to each of the registered services.
 *  Then recall the parent function to create a recursive loop.
 */
const heartBeat = () => {
  setTimeout(() => {
    for (const host of Object.keys(servicesList)) {
      log.info('HeartBeat: ' + beats + ' ' + host)
      // TODO: the service must response new data, it's needed update current serviceList data !!!
      doCheck(host)
    }

    log.debug('HeartBeat Serie: ' + beats + ' done.')
    beats++
    heartBeat()
  }, heartBeatInterval)
}

/*
 *   Clean service list entries based on timestamp value compared to TTL.
 */

const deleteHost = (host) => {
  if (servicesList[host]) delete (servicesList[host])
}

const deleteService = (host, service) => {
  if (servicesList[host] && servicesList[host][service]) {
    delete (servicesList[host][service])
    if (Object.keys(servicesList[host]).length === 0) deleteHost(host)
  }
}

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
        log.info('Deleting service ' + serviceType.toUpperCase() + ' at address ' + host + '. Expiration time: ' + expirationDate.toJSON() + '.')
        //delete (servicesList[host][serviceType])
        deleteService(host, serviceType)
      }
    }

    // Clean parent node if empty
    //if (Object.keys(servicesList[host]).length === 0) delete (servicesList[host])
  }
}

const init = () => {
  return new Promise((resolve, reject) => {
    log = logger.getLogger('registry')
    log.debug('init()')
    loadConfig()
    emptyList()
    heartBeat()
    cleanListJob()

    //if (g.getConfig().registry_listen) {

    try {
      if (process.argv.indexOf('--home') !== -1) {
        process.env.HOME = process.argv[process.argv.indexOf('--home') + 1]
        log.debug('Service Register init at ' + process.env.HOME)
      } else {
        process.exit()
      }

      // TODO: Standalone vs Monolithic bootstrap
      if (true) {
        g.init().then(() => {
          httpServer.init()
            .then(() => {
              log.debug('>> http server started()')
              httpServer.getApi().post('/api/nodes/register', (req, res) => register(req, res))
              httpServer.getApi().post('/api/nodes/unregister', (req, res) => unRegister(req, res))
              httpServer.getApi().get('/api/nodes/check', (req, res) => responseCheckTest(req, res))
              httpServer.getApi().get('/api/services', (req, res) => register(req, res))
              resolve()
            })
        })
      } else resolve()
    } catch (e) {
      reject(e)
    }
  })
}



const logRequest = (req) => {
  console.log('req.app >>>' + req.app)
  console.log('req.baseUrl >>>' + req.baseUrl)
  console.log('req.headers >>>' + JSON.stringify(req.headers))
  console.log('req.body >>>' + JSON.stringify(req.body))
  console.log('req.cookies >>>' + req.cookies)
  console.log('req.fresh >>>' + req.fresh)
  console.log('req.hostname >>>' + req.hostname)
  console.log('req.ip >>>' + req.ip)
  console.log('req.ips >>>' + req.ips)
  console.log('req.originalUrl >>>' + req.originalUrl)
  console.log('req.params >>>' + JSON.stringify(req.params))
  console.log('req.path >>>' + req.path)
  console.log('req.protocol >>>' + req.protocol)
  console.log('req.query >>>' + JSON.stringify(req.query))
  console.log('req.route >>>' + JSON.stringify(req.route))
  console.log('req.secure >>>' + req.secure)
  console.log('req.signedCookies >>>' + req.signedCookies)
  console.log('req.stale >>>' + req.stale)
  console.log('req.subdomains >>>' + req.subdomains)
  console.log('req >>>' + req.xhr)
}

module.exports = {
  init
}

init()

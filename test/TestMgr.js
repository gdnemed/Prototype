/* global process, require, module */

// -------------------------------------------------------------------------------------------
// TestMgr - test manager to simplify the test creation
// - provides an object (via get()) that exposes objects (module references, API routes,
//   specific test methods, etc)
// - Assuming "get()" is called in every test "it(...)" sentence, Lemuria init() is invoked
//   only at first "get()" call. After this first call, Lemuria and other data & references
//   are cached in "_t"
// -------------------------------------------------------------------------------------------

const chai = require('chai')
const chaiHttp = require('chai-http')
chai.use(chaiHttp)
const expect = chai.expect
const fs = require('fs')
const path = require('path')
const g = require('../global')
const sessions = require('../session/sessions')
// -------------------------------------------------------------------------------------------
// "Lemuria" services creation. "get()" procedure using '_t' as a cache
// -------------------------------------------------------------------------------------------
let lemuria
let _lemuriaInitialized = false

const startLemuria = () => {
  return new Promise((resolve, reject) => {
    lemuria.init()
      .then(() => {
        // stores refences to knex objects
        t.dbs = sessions.getDatabases('SPEC')
        t.eventEmitter = g.getEventEmitter()
        console.log('TestMgr: lemuria.init() invoked OK')
        // getting config to know Ports, Urls, etc
        t.config = g.getConfig()
        let port = t.config.api_listen.port
        t.lemuriaAPI = `localhost:${port}`
        console.log(`TestMgr: lemuriaAPI for testing is: ${t.lemuriaAPI}`)
        resolve()
      })
  })
}

// Returns a promise with Lemura services, dbs, config, lemuriaAPI, etc
// Initially, if Lemuria is not started, starts it. On every call, returns _t cached copy
const get = (env = 'test') => {
  process.env.NODE_ENV = env
  lemuria = require('../lemuria.js') // IMPORTANT: require lemuria after setting 'NODE_ENV'!
  console.log('>> TestMgr: config = ' + env)
  return new Promise((resolve, reject) => {
    if (!_lemuriaInitialized) {
      // At first, lemuria infrastructure needs to be created
      console.log('TestMgr: starting Lemuria...')
      startLemuria().then(() => {
        _lemuriaInitialized = true
        resolve(t)
      })
    } else {
      // the other times, _t has everything...
      console.log('TestMgr: reusing _t')
      // IMPORTANT: lemuria was created, but the database was polluted from other tests data
      //            thus, a rollback() + migration() for all sections is needed in other to have
      //            the database cleaned before every it(...) sentence
      resolve(t)
    }
  })
}

// -------------------------------------------------------------------------------------------
// Testing utility methods
// -------------------------------------------------------------------------------------------

// Returns a promise that resolves if a fileName located at /exchange_sources/ is copied to
// a folder exchange_workdir/remote/ (the step required for 'files' module to start an import process)
const prepareFileImport = (fieName) => {
  return new Promise((resolve, reject) => {
    try {
      let envFiles = t.config.exchange.files
      let tSource = envFiles.sources + '\\' + fieName
      let tDest = envFiles.dir + '\\' + fieName
      let strm = fs.createReadStream(tSource).pipe(fs.createWriteStream(tDest))
      strm.on('error', (err) => {
        console.log('prepareFileImport : error stream: ' + err)
        reject(err)
      })
      strm.on('close', () => {
        console.log('prepareFileImport : OK: close stream')
        resolve()
      })
    } catch (err) {
      console.log(err)
      reject(err)
    }
  })
}

// Allows file import tests to occur
// Given a 'fileName' that exists in /exchange_sources/ dir, copies it to .../remote/ dir
// via 'prepareFileImport()'.
// After the .DWN file is copied, the system starts an import procedure whose end needs to be
// detected. This is done via the 'eventEmitter' instance listening to 'onEndImport'
const handleFileImport = (fileName) => {
  return new Promise((resolve, reject) => {
    // when a 'onEndImport' event is received, the event needs to be removed (to not interfere
    // other tests that also are listening to the event), and the promise can be resolved
    const handler = (importResult) => {
      t.eventEmitter.removeListener(g.EVT.onEndImport, handler)
      resolve(importResult)
    }
    // starts listening 'onEndImport' events produced by 'files' module
    t.eventEmitter.on(g.EVT.onEndImport, handler)
    // copies the '*.DWN' file to /remote/ dir to trigger an import procedure
    prepareFileImport(fileName).catch(({response}) => { // No 'then()' here: must wait until evt 'onEndImport' is emited
      let err = 'ERROR: ' + response.status + ' ' + response.text
      console.log(err)
      reject(err)
    })
  })
}

// Removes all files inside 'path'
const removeDirectorySync = (removePath) => {
  console.log('TestMgr: removeDirectorySync : ' + removePath)
  fs.readdir(removePath, (err, files) => {
    if (err) return false
    for (const file of files) {
      let fileToRemove = path.join(removePath, file)
      fs.unlink(fileToRemove, err => {
        if (err) return false
      })
    }
  })
  return true
}

// After an 'import' process, a number of *.DWN and *.LOG files are created inside
// exchange_workdir subdirectoris. Clears all this files and resolves a promise when done
// A 10ms timeout is required in order to avoid untracked files due to filesystem latencies
const cleanImportFiles = (fieName) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      let envFiles = t.config.exchange.files
      let remotePath = envFiles.dir // exchange_workdir/remote/  (after an import process contains .LOG files)
      let donePath = envFiles.workdir + '\\done\\' // exchange_workdirdone/  (after an import process contains .DWN files)
      if (!removeDirectorySync(remotePath)) reject(new Error())
      if (!removeDirectorySync(donePath)) reject(new Error())
      resolve()
    }, 10)
  })
}

// -------------------------------------------------------------------------------------------
// Testing utility methods
// -------------------------------------------------------------------------------------------
// For every section (objects, settings, etc), rollback() and migration() is invoked to grant cleaned tables
const rollbackAndMigrateDatabases = () => {
  let kObjects = t.dbs['objects'], kInputs = t.dbs['inputs'], kState = t.dbs['state']
  return kObjects.migrate.rollback()
    .then(() => kInputs.migrate.rollback())
    .then(() => kState.migrate.rollback())
    .then(() => kObjects.migrate.latest())
    .then(() => kInputs.migrate.latest())
    .then(() => kState.migrate.latest())
}

const expectProps = (realObj, expectedObj) => {
  for (let k in expectedObj) {
    if (expectedObj.hasOwnProperty(k)) {
      console.log('checking property: ' + k + ' realValue: ' + realObj[k] + ' expected: ' + expectedObj[k])
      expect(realObj[k]).to.equal(expectedObj[k])
    }
  }
}

// Sends 'data' via http POST query to 'route'
const sendGET = (route) => chai.request(t.lemuriaAPI).get(route).set('Authorization', 'APIKEY 123')
// Sends 'data' via http POST query to 'route'
// const sendPOST = (route, data) => chai.request(t.lemuriaAPI).post(route).set('Authorization', 'APIKEY 123').send(data)
// Gets the DB related to 'section' &  'tableName'
const getCollection = (section, tableName) => t.dbs[section].select().table(tableName)

const sendPOST = (route, data) => {
  let _resp
  return new Promise((resolve, reject) => {
    const handler = () => {
      t.eventEmitter.removeListener(g.EVT.onEntityVersionChange, handler)
      resolve(_resp)
    }
    t.eventEmitter.on(g.EVT.onEntityVersionChange, handler)
    chai.request(t.lemuriaAPI)
      .post(route)
      .set('Authorization', 'APIKEY 123')
      .send(data)
      .then((reaponse) => {
        _resp = reaponse
      })
  })
}

// Holds references to everything that a 'spec' or 'test' file can need, i.e dbs, config, lemuriaAPI, etc
let t = {
  chai,
  chaiHttp,
  expect,
  sendPOST,
  sendGET,
  getCollection,
  expectProps,
  rollbackAndMigrateDatabases,
  handleFileImport,
  cleanImportFiles
}

module.exports = {
  get
}

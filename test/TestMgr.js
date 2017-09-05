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
const g = require('../src/global')
const sessions = require('../src/session/sessions')
// -------------------------------------------------------------------------------------------
// "Lemuria" services creation. "get()" procedure using '_t' as a cache
// -------------------------------------------------------------------------------------------
let lemuria
let _lemuriaInitialized = false
let terminal
let _terminalInitialized = false

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
        let termEmulport = 5052
        if (t.config.terminal_emulator) termEmulport = t.config.terminal_emulator.api.port
        t.terminalEmulatorAPI = `localhost:${termEmulport}`
        console.log(`TestMgr: lemuriaAPI for testing is: ${t.lemuriaAPI}`)
        resolve()
      })
  })
}

// Returns a promise with Lemura services, dbs, config, lemuriaAPI, etc
// Initially, if Lemuria is not started, starts it. On every call, returns _t cached copy
const get = (env = 'test') => {
  process.env.NODE_ENV = env
  lemuria = require('../src/lemuria.js') // IMPORTANT: require lemuria after setting 'NODE_ENV'!
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

const startTerminalEmulator = () => {
  terminal = require('./emulators/terminal.js')
  console.log('>> TestMgr: startTerminalEmulator')
  return new Promise((resolve, reject) => {
    if (!_terminalInitialized) {
      terminal.init('/test/emulators') //SubPath is needed, because cwd where all testa are executed is  /LEMURIA/Prototype/
      console.log('TestMgr: terminal init() was called')
      _terminalInitialized = true
      resolve()
    }
  })
}

// -------------------------------------------------------------------------------------------
// Testing utility methods
// -------------------------------------------------------------------------------------------

// Returns a promise that resolves if a fileName located at /exchange_sources/ is copied to
// a folder exchange_workdir/remote/ (the step required for 'files' module to start an import process)
const prepareFileImport = (fieName, fileNameSrc) => {
  return new Promise((resolve, reject) => {
    try {
      let envFiles = t.config.exchange.files
      let realFnameSrc = fileNameSrc || fieName
      let tSource = envFiles.sources + '\\' + realFnameSrc
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
// Given a source file ('fileNameSrc' if defined, or fileNameDest if fileNameSrc is not defined)
// that exists in /exchange_sources/ dir, copies it to .../remote/ dir via 'prepareFileImport()'.
// After the .DWN file is copied, the system starts an import procedure whose end needs to be
// detected. This is done via the 'eventEmitter' instance listening to 'onEndImport'
const handleFileImport = (fileNameDest, fileNameSrc) => {
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
    prepareFileImport(fileNameDest, fileNameSrc).catch(({response}) => { // No 'then()' here: must wait until evt 'onEndImport' is emited
      let err = 'ERROR: ' + response.status + ' ' + response.text
      console.log(err)
      reject(err)
    })
  })
}

// Removes all files inside 'path'
const removeDirectorySync = (removePath) => {
  console.log('TestMgr: removeDirectorySync : ' + removePath)
  let files = fs.readdirSync(removePath)
  for (const file of files) {
    let fileToRemove = path.join(removePath, file)
    fs.unlinkSync(fileToRemove)
  }
  return true
}

// After an 'import' process, a number of *.DWN and *.LOG files are created inside
// exchange_workdir subdirectoris. Clears all this files and resolves a promise when done
const cleanImportFiles = (fieName) => {
  return new Promise((resolve, reject) => {
    let envFiles = t.config.exchange.files
    let remotePath = envFiles.dir // exchange_workdir/remote/  (after an import process contains .LOG files)
    let donePath = envFiles.workdir + '\\done\\' // exchange_workdirdone/  (after an import process contains .DWN files)
    if (!removeDirectorySync(remotePath)) reject(remotePath)
    if (!removeDirectorySync(donePath)) reject(donePath)
    resolve()
  })
}

// -------------------------------------------------------------------------------------------
// Testing utility methods
// -------------------------------------------------------------------------------------------
// For every section (objects, settings, etc), rollback() and migration() is invoked to grant cleaned tables
const rollbackAndMigrateDatabases = () => {
  let kObjects = t.dbs['objects'], kInputs = t.dbs['inputs2017'], kState = t.dbs['state']
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
      if (realObj) {
        console.log('checking property: ' + k + ' realValue: ' + realObj[k] + ' expected: ' + expectedObj[k])
        expect(realObj[k]).to.equal(expectedObj[k])
      } else expect(realObj).to.not.equal(undefined)
    }
  }
}

// Sends 'data' via http POST query to 'route'
const sendGET = (route) => chai.request(t.lemuriaAPI).get(route).set('Authorization', 'APIKEY 123')
// Gets the DB related to 'section' &  'tableName'
const getCollection = (section, tableName) => t.dbs[section].select().table(tableName)

const terminalEmulatorSendGET = (route) => {
  return chai.request(t.terminalEmulatorAPI).get(route)
}

// Sends 'data' via http POST query to 'route' (without syncronization)
const _post = (route, data) => chai.request(t.lemuriaAPI).post(route).set('Authorization', 'APIKEY 123').send(data)

// Sends 'data' via http POST (with syncronization by default)
// If no sync is needed, a normal _post() is sent
// DESCRIPTON: A normal test usually sends a POST, does some check to verify some data after the POST
// operation, an then calls "done()". After this, the test's "afterEach()" method is called and
// t.rollbackAndMigrateDatabases() is invoked. This implies that after a "sendPOST" called from
// a test, the DB is recreated. Sometimes, there are other procedures executed inside the "logic" module
// after a POST operation that require the DB to be present. When this happens (the DB is ready
// to be destroyed,  the 'logic' module sends "onEntityVersionChange" event
const sendPOST = (route, data, sync = true) => {
  if (!sync) return _post(route, data)
  else {
    let _resp
    let resolved = false
    return new Promise((resolve, reject) => {
      const handler = () => {
        t.eventEmitter.removeListener(g.EVT.onEntityVersionChange, handler)
        if (_resp) {
          resolved = true
          resolve(_resp)
        }
      }
      t.eventEmitter.on(g.EVT.onEntityVersionChange, handler)
      let pr = _post(route, data)
      pr.then((resp) => {
        _resp = resp
        if (!resolved) {
          resolved = true
          resolve(_resp)
        }
      })
        .catch(reject)
    })
  }
}


const sendDELETE = (route, data) => {
  return chai.request(t.lemuriaAPI).delete(route).set('Authorization', 'APIKEY 123').send(data)
}


// Holds references to everything that a 'spec' or 'test' file can need, i.e dbs, config, lemuriaAPI, etc
let t = {
  chai,
  chaiHttp,
  expect,
  sendPOST,
  sendGET,
  sendDELETE,
  getCollection,
  expectProps,
  rollbackAndMigrateDatabases,
  handleFileImport,
  cleanImportFiles,
  terminalEmulatorSendGET
}

module.exports = {
  get,
  startTerminalEmulator
}

/* global process, require, module */

// -------------------------------------------------------------------------------------------
// TestMgr - test manager to simplify the test creation
// - provides an object (via get()) that exposes objects (module references, API routes,
//   specific test methods, etc)
// - Assuming "get()" is called in every test "it(...)" sentence, Lemuria init() is invoked
//   only at first "get()" call. After this first call, Lemuria and other data & references
//   are cached in "_t"
// -------------------------------------------------------------------------------------------
require('dotenv').config()
require('../src/defaults').addDefaults()
process.env.LEMURIA_HOME = process.env.LEMURIA_HOME || './test/scenarios/basic'

const chai = require('chai')
const chaiHttp = require('chai-http')
chai.use(chaiHttp)
const expect = chai.expect
const fs = require('fs')
const path = require('path')
const g = require('../src/global')
const sessions = require('../src/session/sessions')
const migrations = require('../src/migrations.js')
// -------------------------------------------------------------------------------------------
// "Lemuria" services creation. "get()" procedure using '_t' as a cache
// -------------------------------------------------------------------------------------------
let lemuria
let _lemuriaInitialized = false
let terminal
let _terminalInitialized = false

const loadJsonFile = () => {
  let fileName = process.env.LEMURIA_HOME + '/config.json'
  try {
    console.log(`Using file ${fileName}`)
    return fs.readFileSync(fileName, 'utf8')
  } catch (err) {
    console.log(`File not found ${fileName}`)
  }
}

const startLemuria = () => {
  return new Promise((resolve, reject) => {
    // getting config to know Ports, Urls, etc
    t.config = JSON.parse(applyEnvVars(loadJsonFile()))
    if (t.config.files) {
      t.config.files.dir = process.env.ROOT_TEST + '/' + t.config.files.dir
      t.config.files.workdir = process.env.ROOT_TEST + '/' + t.config.files.workdir
      t.config.files.sources = process.env.ROOT_TEST + '/' + t.config.files.sources
    }
    if (t.config.clockings) {
      t.config.clockings.dir = process.env.ROOT_TEST + '/' + t.config.clockings.dir
    }
    lemuria.init({
      apiPort: t.config.api_listen.port,
      comsListen: t.config.coms_listen,
      home: process.env.LEMURIA_HOME,
      localServices: t.config.localServices,
      files: t.config.files,
      clockings: t.config.clockings,
      server: t.config.server
    })
      .then(() => {
        // stores refences to knex objects
        t.dbs = sessions.getDatabases('SPEC')
        t.eventEmitter = g.getEventEmitter()
        console.log('TestMgr: lemuria.init() invoked OK')
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

const startTerminalEmulator = () => {
  let termEmulport = 5052
  if (t.config.terminal_emulator.api.port) termEmulport = t.config.terminal_emulator.api.port
  t.terminalEmulatorAPI = `localhost:${termEmulport}`
  terminal = require('./emulators/terminal.js')
  console.log('>> TestMgr: startTerminalEmulator')
  return new Promise((resolve, reject) => {
    if (!_terminalInitialized) {
      terminal.init(termEmulport, t.config.coms_listen.host, t.config.coms_listen.port)
      // terminal.init('/test/emulators') // SubPath is needed, because cwd where all testa are executed is  /LEMURIA/Prototype/
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
      let envFiles = t.config.files
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
    let envFiles = t.config.files
    let remotePath = envFiles.dir // exchange_workdir/remote/  (after an import process contains .LOG files)
    let donePath = envFiles.workdir + '\\done\\' // exchange_workdirdone/  (after an import process contains .DWN files)
    if (!removeDirectorySync(remotePath)) reject(remotePath)
    if (!removeDirectorySync(donePath)) reject(donePath)
    resolve()
  })
}

// Given a line of an exported file, ex: 3,"1205","3057323748",20170906,123733,"N",0,"E00",0
// returns tru if every value in arrValues is inside the line, ex: [3,1205,E00]
const checkValuesInsideLine = (line, arrValues) => {
  let found = true
  arrValues.forEach((value) => { // Always iterates all element (no break is possible)
    if (line.indexOf(value) < 0) found = false
  })
  return found
}

// Given the contents of a csv file (export), checks if it contains a line (separator is \r\n) with values contained in arrValues
// Example: if "arrValues" == [3,1205,E00]
//         a line inside 'content' containing =>  3,"1205","3057323748",20170906,123733,"N",0,"E00",0 will return true
const checkCSVExport = (content, arrValues) => {
  let arLines = content.split('\r\n')
  const containsValues = (line) => line && checkValuesInsideLine(line, arrValues)
  let arFiltered = arLines.filter(containsValues)
  let found = arFiltered && arFiltered.length > 0
  if (!found) console.log('CHECK ERROR: TestMgr =>  values [ ' + arrValues.toString() + ' ] not found inside file')
  return found
}

const getExportClockingsFileName = () => {
  let clkExports = t.config.clockings.dir
  return clkExports + '\\' + t.config.clockings.fileName
}

// Checks the corresponding clocking export file (as specified in config.js) to contain a csv expression
// corresponding to a clkObj (that correspond to the clocking returned by /api/coms/clockings
const verifyExportClockings = (arrValues) => {
  return new Promise((resolve, reject) => {
    try {
      fs.readFile(getExportClockingsFileName(), 'utf8', (err, contents) => {
        if (err && (err.code !== 'ENOENT')) reject(err)
        else if (contents && checkCSVExport(contents, arrValues)) resolve()
        reject(err)
      })
    } catch (err) {
      reject(err)
    }
  })
}

// Removes the 'exports' file (whose name & dir) appears i config.json
// Removes Sync (no extra syncronization is required)
const removeExportClockingsFile = () => {
  let exportClkFileName = getExportClockingsFileName()
  if (fs.existsSync(exportClkFileName)) {
    fs.unlinkSync(exportClkFileName)
  }
}

// -------------------------------------------------------------------------------------------
// Testing utility methods
// -------------------------------------------------------------------------------------------
// For every section (objects, settings, etc), rollback() and migration() is invoked to grant cleaned tables
const rollbackAndMigrateDatabases = () => {
  let kObjects = t.dbs['objects']
  let kInputs = t.dbs['inputs2017']
  let kState = t.dbs['state']

  return migrations.cleanMigrationMetadata('SPEC', 'objects', t.dbs)
    .then(() => migrations.addMigrationMetadata('SPEC', 'objects', t.dbs, 'objects_migration.js'))
    .then(() => kObjects.migrate.rollback())
    .then(() => kObjects.migrate.latest())
    // Cleaned OBJECTS
    .then(() => migrations.cleanMigrationMetadata('SPEC', 'inputs2017', t.dbs))
    .then(() => migrations.addMigrationMetadata('SPEC', 'inputs2017', t.dbs, 'inputs_migration.js'))
    .then(() => kInputs.migrate.rollback())
    .then(() => kInputs.migrate.latest())
    // Cleaned INPUTS
    .then(() => migrations.cleanMigrationMetadata('SPEC', 'state', t.dbs))
    .then(() => migrations.addMigrationMetadata('SPEC', 'state', t.dbs, 'state_migration.js'))
    .then(() => kState.migrate.rollback())
    .then(() => kState.migrate.latest())
    // Cleaned STATE
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
  verifyExportClockings,
  removeExportClockingsFile,
  rollbackAndMigrateDatabases,
  handleFileImport,
  cleanImportFiles,
  terminalEmulatorSendGET,
  CORRECT_CLOCKING: 'E00', // Code for a correct clocking
  INCORRECT_CLOCKING: 'E02' // Code for an incorrect clocking
}

module.exports = {
  get,
  startTerminalEmulator
}

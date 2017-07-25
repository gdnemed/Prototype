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

// -------------------------------------------------------------------------------------------
// "Lemuria" services creation. "get()" procedure using '_t' as a cache
// -------------------------------------------------------------------------------------------
process.env.NODE_ENV = 'test'
const lemuria = require('../lemuria.js')
let _lemuriaInitialized = false

const startLemuria = () => {
  return new Promise((resolve, reject) => {
    lemuria.init()
      .then((knexObj) => {
        // stores refences to knex objects
        t.knexRefs = knexObj
        console.log('TestMgr: lemuria.init() invoked OK')
        // getting environment to know Ports, Urls, etc
        t.environment = lemuria.getEnvironment()
        let port = t.environment.api_listen.port
        t.lemuriaAPI = `localhost:${port}`
        console.log(`TestMgr: lemuriaAPI for testing is: ${t.lemuriaAPI}`)
        resolve()
      })
  })
}

// Returns a promise with Lemura services, knexRefs, environment, lemuriaAPI, etc
// Initially, if Lemuria is not started, starts it. On every call, returns _t cached copy
const get = () => {
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
// For every section (objects, settings, etc), rollback() and migration() is invoked to grant cleaned tables
const rollbackAndMigrateDatabases = () => {
  let kObjects = t.knexRefs['objects'], kInputs = t.knexRefs['inputs'], kState = t.knexRefs['state']
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
const sendPOST = (route, data) => chai.request(t.lemuriaAPI).post(route).send(data)
const getCollection = (res, section, tableName) => t.knexRefs[section].select().table(tableName)

// Holds references to everything that a 'spec' or 'test' file can need, i.e knexRefs, environment, lemuriaAPI, etc
let t = {
  chai,
  chaiHttp,
  expect,
  // Sends 'data' via http POST query to 'route'
  sendPOST,
  getCollection,
  expectProps,
  rollbackAndMigrateDatabases
}

module.exports = {
  get
}

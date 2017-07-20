/* global process, require, module */
const chai = require('chai')
const chaiHttp = require('chai-http')
chai.use(chaiHttp)
const expect = chai.expect

process.env.NODE_ENV = 'test'

const lemuria = require('../lemuria.js')

// Holds references to everything that a 'spec' or 'test' file can need, i.e knexRefs, environment, lemuriaAPI, etc
let _testdata

const startLemuria = () => {
  return new Promise((resolve, reject) => {
    lemuria.init()
      .then((knexObj) => {
        _testdata = {
          chai,
          chaiHttp,
          expect
        }
        // getting refences to knex objects
        _testdata.knexRefs = knexObj
        console.log('TestMgr: lemuria.init() invoked OK')
        // getting environment to know Ports, Urls, etc
        _testdata.environment = lemuria.getEnvironment()
        let port = _testdata.environment.api_listen.port
        _testdata.lemuriaAPI = `localhost:${port}`
        console.log(`TestMgr: lemuriaAPI for testing is: ${_testdata.lemuriaAPI}`)
        resolve()
      })
  })
}

const get = () => {
  return new Promise((resolve, reject) => {
    if (!_testdata) {
      // First time, lemuria infrastructure needs to be created
      console.log('TestMgr: starting Lemuria...')
      startLemuria().then(() => resolve(_testdata))
    } else {
      // other times, _testdata has everything...
      console.log('TestMgr: reusing _testdata')
      resolve(_testdata)
    }
  })
}

module.exports = {
  get
}

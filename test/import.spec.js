/* global process, require, describe, beforeEach, it, afterEach */
const TestMgr = require('./TestMgr.js')
const events = require('events')
let t // Reference to data obtained from TestMgr().get

let evm = new events.EventEmitter()
evm.on('onEndImport', ({path, importType}) => {
  console.log('#### EUREKA! onEndImport event received')
  // done()
})

describe('import.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('RECORDS.DWN is properly imported, "onEndImport" event is received with ok = true', (done) => {
    t.eventEmitter.on('onEndImport', ({path, importType, ok}) => {
      //TODO: test created recods (via querying db or API GET)
      t.expect(ok).to.equal(true)
      done()
    })
    // No 'then()' here: must wait until evt 'onEndImport' is emited
    t.prepareFileImport('RECORDS.DWN').catch(({response}) => {
      console.log('ERROR: ' + response.status + ' ' + response.text)
    })
  })

  afterEach((done) => {
    t.rollbackAndMigrateDatabases().then(() => done())
  })
})

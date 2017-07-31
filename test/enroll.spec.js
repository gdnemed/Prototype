/* global process, require, describe, beforeEach, it, afterEach */
const TestMgr = require('./TestMgr.js')
const sc = require('./scenarios')

let t // Reference to data obtained from TestMgr().get

let enrollA = {enroll: 20170803120845}

describe('enroll.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('POST enrollA', (done) => {
    sc.createSc1(t).then(() => {
      /*t.sendPOST('/api/coms/records/1U_1C/enroll', enrollA)
        .then((res) => {
          t.expect(res.status).to.equal(200)
          done()
        })*/
      done()
    })
  })

  // -------------------------------------------------------------------------------------------
  // afterEach(): OPTION 1) Destroys and recreates BD from it() to other it()'s
  // -------------------------------------------------------------------------------------------
  afterEach((done) => {
    t.rollbackAndMigrateDatabases().then(() => done())
  })
  // -------------------------------------------------------------------------------------------
  // afterEach(): OPTION 2) (NOT Prefereable) Does nothing, tables are not restored from it() to other it()'s
  // -------------------------------------------------------------------------------------------
  /*
   afterEach((done) => {
   done()
   })
   */
})

/* global process, require, describe, beforeEach, it, afterEach */
const TestMgr = require('./TestMgr.js')
const sc = require('./scenarios')

let t // Reference to data obtained from TestMgr().get

const info1 = {
  value: 'Holidays: 10:25',
  date: 20170804
}

describe('infos.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('POST (simpleInfo) to /records/ and GET via /records/ returns the user and card', (done) => {
    sc.createSc1(t).then(() => {
      done()
    })
   /* t.sendPOST('/api/coms/records/1U_1C/info', info1)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/records/1U_1C/info')
          .then((res) => {
            t.expect(res.status).to.equal(200)
            console.log(res.body)
            done()
          })
          .catch(({response}) => console.log('ERROR: ' + response.status + ' ' + response.text))
      })
      .catch(({response}) => console.log('ERROR: ' + response.status + ' ' + response.text))
      */
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

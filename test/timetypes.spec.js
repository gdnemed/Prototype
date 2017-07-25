/* global process, require, describe, beforeEach, it, afterEach */

const TestMgr = require('./TestMgr.js')
let t // Reference to data obtained from TestMgr().get

const ttOne = {
  'name': 'TT0',
  'text': 'TT_1_Sin_incidencia',
  'code': 'IC_00',
  'timetype_grp': [{'code': 'TT_1U_1C'}]
}

describe('timetypes.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('POST (oneUserOneCard) to /records/ and GET via /records/ returns the user and card', (done) => {
    t.sendPOST('/api/coms/timetypes', ttOne)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/timetypes').then((res) => {
          t.expect(res.status).to.equal(200)
          let rec0 = res.body[0]
          t.expectProps(rec0, {code: ttOne.code, text: ttOne.text})

          // TODO: only returns => { code: 'IC_00', text: 'TT_1_Sin_incidencia' }
          // TODO: no id ? com fem el 'update' i 'delete' ?
          console.log(rec0)

          done()
          // UPDATE (POST without id)
          /*
          t.sendPOST('/api/coms/timetypes', {
            'code': 'IC_00',
            'text': '_UPDATED_tt'
          }).then((res) => {
            t.expect(res.status).to.equal(201)
            done()
          })
          */

        })
      })
      .catch((err) => {
        console.log(err)
      })
  })

  // GET /api/coms/records or GET /api/coms/records/:id
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

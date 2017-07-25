/* global process, require, describe, beforeEach, it, afterEach */

const TestMgr = require('./TestMgr.js')
let t // Reference to data obtained from TestMgr().get

const oneUserOneCard = {
  'id': '1U_1C',
  'name': '1U_1C Alba Maria Estany',
  'code': '0455',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'TT_1U_1C'}],
  'card': [{'code': 'CARD_CODE_1U_1C', 'start': 20170105, 'end': 20170822}]
}

describe('API Routes', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('POST (oneUserOneCard) to /records/ and GET via /records/ returns the user and card', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/records').then((res) => {
          t.expect(res.status).to.equal(200)
          console.log(res.body)
          let rec0 = res.body[0]
          t.expectProps(rec0, {
            id: oneUserOneCard.id,
            code: oneUserOneCard.code,
            name: oneUserOneCard.name,
            language: oneUserOneCard.language
          })
          // chcking tt_group => array [{'code': 'TT_1U_1C'}],
          t.expectProps(rec0.timetype_grp[0], oneUserOneCard.timetype_grp[0])
          // checking validity
          t.expectProps(rec0.validity[0], oneUserOneCard.validity[0])
          done()
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

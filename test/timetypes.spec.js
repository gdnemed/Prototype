/* global process, require, describe, before, after, it */

const equal = require('deep-equal')
const TestMgr = require('./TestMgr.js')
let t // Reference to data obtained from TestMgr().get

const ttOne = {
  'text': {es: 'TT_1_Sin_incidencia', en: 'TT_1_Without_abs'},
  'code': 'IC_00',
  'groups': ['TT_1U_1C']
}

const ttOne1GrMore = {
  'code': 'IC_00',
  'groups': ['TT_1U_1C', 'TT_1U_2C']
}

const ttOne1LangMore = {
  'code': 'IC_00',
  'text': {es: 'TT_1_Sin_incidencia', en: 'TT_1_Without_abs', cat: 'TT_1_Sense_incidencia'},
}

describe('timetypes.spec.js', () => {
  before((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('POST (ttOne) to /timetypes/ and GET via /timetypes/ returns the timetype', (done) => {
    t.sendPOST('/api/coms/timetypes', ttOne)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/timetypes').then((res) => {
          t.expect(res.status).to.equal(200)
          let rec0 = res.body[0]
          t.expect(rec0.code).to.equal(ttOne.code)
          let e = equal(rec0.groups, ttOne.groups)
          t.expect(e).to.equal(true)
          t.expectProps(ttOne.text, rec0.text)
          console.log(rec0)
          done()
        })
      })
      .catch((err) => {
        console.log(err)
      })
  })

  it('POST (ttOne1GrMore) to add 1 group', (done) => {
    t.sendPOST('/api/coms/timetypes', ttOne1GrMore)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/timetypes').then((res) => {
          t.expect(res.status).to.equal(200)
          let rec0 = res.body[0]
          t.expect(rec0.code).to.equal(ttOne1GrMore.code)
          let e = equal(rec0.groups, ttOne1GrMore.groups)
          t.expect(e).to.equal(true)
          console.log(rec0)
          done()
        })
      })
      .catch((err) => {
        console.log(err)
      })
  })

  it('POST (ttOne1LangMore) to add 1 language', (done) => {
    t.sendPOST('/api/coms/timetypes', ttOne1LangMore)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/timetypes').then((res) => {
          t.expect(res.status).to.equal(200)
          let rec0 = res.body[0]
          t.expect(rec0.code).to.equal(ttOne1LangMore.code)
          t.expectProps(equal(rec0.text, ttOne1LangMore.text))
          console.log(rec0)
          done()
        })
      })
      .catch((err) => {
        console.log(err)
      })
  })

  it('DELETE (IC_00) to remove 1 time type', (done) => {
    // TODO
    done()
  })
  // -------------------------------------------------------------------------------------------
  // afterEach(): OPTION 1) Destroys and recreates BD from it() to other it()'s
  // -------------------------------------------------------------------------------------------
  after((done) => {
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

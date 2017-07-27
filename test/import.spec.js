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
    t.handleFileImport('RECORDS.DWN').then(({path, importType, ok}) => {
      t.expect(ok).to.equal(true)

      // GET via api/records
      t.sendGET('/api/coms/records').then((res) => {
        t.expect(res.status).to.equal(200)
        t.expect(res.body.length).to.equal(4)
        // ROW 0 check
        let rec0 = res.body[0]
        t.expectProps(rec0, {
          id: '347382',
          code: '1205',
          name: 'Pedro Gómez',
          language: 'es'
        })
        // ROW 1 check
        let rec1 = res.body[1]
        t.expectProps(rec1, {
          id: 'T123412',
          code: '4532',
          name: 'Anna Smith',
          language: 'en'
        })
        // ROW 2 check
        let rec2 = res.body[2]
        t.expectProps(rec2, {
          id: '29332726M',
          code: '872',
          name: 'François Dupont',
          language: 'fr'
        })
        // ROW 2 check
        let rec3 = res.body[3]
        t.expectProps(rec3, {
          id: '5432452K',
          code: '8821',
          name: 'Günter Mayer',
          language: 'de'
        })
        done()
      })
    })
  })

  it('TTYPES.DWN is properly imported, "onEndImport" event is received with ok = true', (done) => {
    t.handleFileImport('TTYPES.DWN').then(({path, importType, ok}) => {
      t.expect(ok).to.equal(true)

      // GET via api/records
      t.sendGET('/api/coms/timetypes').then((res) => {
        t.expect(res.status).to.equal(200)
        console.log(res.body)
        t.expect(res.body.length).to.equal(2)

        // ROW 0 check
        let rec0 = res.body[0]
        t.expectProps(rec0, {code: '8'})
        t.expectProps(rec0.text, {en: 'Holidays', es: 'Vacaciones'})
        console.log('record code 8 => ttgrp is ' + JSON.stringify(rec0.timetype_grp[0]))
        t.expect(rec0.timetype_grp).to.deep.include('HL01')
        t.expect(rec0.timetype_grp).to.deep.include('OF2')
        // ROW 1 check
        let rec1 = res.body[1]
        t.expectProps(rec1, {code: '9'})
        t.expectProps(rec1.text, {en: 'Business travel', es: 'Viaje de negocios'})
        console.log(rec1.timetype_grp[0])
        console.log('record code 9 => ttgrp is ' + JSON.stringify(rec1.timetype_grp[0]))
        t.expect(rec0.timetype_grp).to.deep.include('HL01')
        done()
      })
    })
  })

  afterEach((done) => {
    t.rollbackAndMigrateDatabases()
      .then(t.cleanImportFiles)
      .then(() => done())
  })
})

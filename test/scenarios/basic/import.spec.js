/* global process, require, describe, beforeEach, it, afterEach */
const fs = require('fs')
const path = require('path')
const TestMgr = require('../../TestMgr.js')
const equal = require('deep-equal')
let t // Reference to data obtained from TestMgr().get

describe('import.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('per.csv is properly imported, "onEndImport" event is received with ok = true', (done) => {
    t.handleFileImport('per.csv').then(({pathFile, importType, ok}) => {
      t.expect(ok).to.equal(true)
      let files = fs.readdirSync(path.join(t.config.exchange.files.workdir, 'done'))
      t.expect(files.length).to.equal(0)
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

  it('tty.csv is properly imported, "onEndImport" event is received with ok = true', (done) => {
    t.handleFileImport('tty.csv').then(({path, importType, ok}) => {
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
        console.log('record code 8 => groups is ' + JSON.stringify(rec0.groups))
        t.expect(equal(rec0.groups, ['HL01', 'OF2'])).to.equal(true)
        // ROW 1 check
        let rec1 = res.body[1]
        t.expectProps(rec1, {code: '9'})
        t.expectProps(rec1.text, {en: 'Business travel', es: 'Viaje de negocios'})
        console.log('record code 9 => groups is ' + JSON.stringify(rec1.groups))
        t.expect(equal(rec1.groups, ['OF2'])).to.equal(true)
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

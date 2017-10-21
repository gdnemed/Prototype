/* global process, require, describe, beforeEach, it, afterEach */
const fs = require('fs')
const path = require('path')
const TestMgr = require('../../TestMgr.js')
const equal = require('deep-equal')
let t // Reference to data obtained from TestMgr().get

describe('noDeleteFile.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('per.csv is properly imported, and moved to done directory', (done) => {
    t.handleFileImport('per.csv').then(({filePath, importType, ok}) => {
      t.expect(ok).to.equal(true)
      //Imported file is moved to done directory
      t.expect(fs.readdirSync(path.join(t.config.exchange.files.workdir, 'done')).length).to.greaterThan(0)
      done()
    })
  })


  afterEach((done) => {
    t.rollbackAndMigrateDatabases()
      .then(t.cleanImportFiles)
      .then(() => done())
  })
})

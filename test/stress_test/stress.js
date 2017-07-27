const TestMgr = require('../TestMgr.js')
const logger = require('../../utils/log')
let t // Reference to data obtained from TestMgr().get
let lg

const configLog = () => {
  logger.configure(process.cwd())
  lg = logger.getLogger('stress')
}

const init = () => {
  configLog()
  lg.debug('stress init()')
  return TestMgr.get('stress_test') // Required type of environment = 'stress_test' (this allows stress tests DB to be located at /db/stress_test)
}

init().then((_testdata) => {
  t = _testdata
  lg.debug('>> stress application ready. lemuriaAPI: ' + t.lemuriaAPI)

  t.rollbackAndMigrateDatabases()
    .then(() => {
      lg.debug('checking a simple import process RECORDS.DWN')
      t.handleFileImport('RECORDS.DWN')
        .then(({path, importType, ok}) => {
          lg.info('RECORDS.DWN executed. result is ' + ok)
        })
        .then(() => {
          lg.debug('cleaning import files')
          t.cleanImportFiles()
        })
    })
})

/* global process, module */
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

const executeImport = (type, n) => {
  return new Promise((resolve, reject) => {
    let fNameSrc = `${type}_${n}.txt`
    lg.debug(`>> stress: START import of ${fNameSrc}`)
    measureStart()
    t.handleFileImport(`${type}.DWN`, fNameSrc)
      .then(({path, importType, ok}) => {
        measureEnd(`${fNameSrc} finished import process. result is ${ok}`)
        resolve()
      })
  })
}

init().then((_testdata) => {
  t = _testdata
  lg.debug('>> stress application ready. lemuriaAPI: ' + t.lemuriaAPI)

  t.rollbackAndMigrateDatabases()
    // .then(() => executeImport('RECORDS', 1000))
    .then(() => executeImport('RECORDS', 100))
    // .then(() => executeImport('RECORDS', 20))
    .then(() => {
      lg.debug('cleaning import files')
      t.cleanImportFiles().then(() => {
        process.exit()
      })
    })
    .catch((err) => {
      lg.error(err)
    })
})

// -------------------------------------------------------------------------------------------
// Measuring durations
// -------------------------------------------------------------------------------------------
let _timeRef
const measureStart = () => {
  lg.info('measureStart')
  _timeRef = process.hrtime()
}
const measureEnd = (infoTxt, reStart) => {
  lg.info('measureEnd')
  let precision = 3 // 3 decimal places
  let elapsed = process.hrtime(_timeRef)
  let measuredMS = (elapsed[1] / 1000000).toFixed(precision) // divide by a million to get nano to milli
  if (infoTxt) {
    lg.info(`${infoTxt} - ${elapsed[0]} s. ${measuredMS} ms.`)
  }
  if (reStart) {
    _timeRef = process.hrtime()
  }
  return measuredMS
}

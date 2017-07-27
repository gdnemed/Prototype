const fs = require('fs')

process.env.NODE_ENV = 'stress_test'

let cfg // config file
let destPath // path where created files must be stored

const ensyreTwoDigitsStr = (n) => {
  if (n < 10) {
    n = '0' + n
  } else {
    n = '' + n // '' + converts to string
  }
  return n
}

// ID,CODE,NAME,CARD,LANGUAGE,TTGROUP,ACCESGROUP,START,END
// 347382,1205,Pedro Gómez,3057323748,es,HL01,AC50,,
const injectRecord = (i) => {
  let id = i
  let code = 100 + i
  let name = 'record_' + i
  let card = '30000' + i
  let lang = i % 2 === 0 ? 'es' : 'fr'
  let ttgrp = i % 4 === 0 ? 'HL0' + i : 'VC0' + i
  let acgrp = i % 4 === 0 ? 'ACGRP0' + i : 'AG1' + i
  let dayStart = ensyreTwoDigitsStr(i % 28)
  let dayEnd = ensyreTwoDigitsStr((i + 15) % 28)
  let mStart = ensyreTwoDigitsStr(i % 12)
  let mEnd = ensyreTwoDigitsStr((i + 6) % 12)
  let valStart = 2017 + mStart + dayStart
  let valEnd = 2017 + mEnd + dayEnd
  let arVals = [id, code, name, card, lang, ttgrp, acgrp, valStart, valEnd, '\n']
  return arVals.join(',')
}

// CODE,LANGUAGE,TTGROUP,TEXT
// 8,en,HL01,Holidays
const injectTimeType = (i) => {
  let code = i
  let lang = i % 2 === 0 ? 'es' : 'fr'
  let ttgrp = i % 4 === 0 ? 'HL0' + i : 'VC0' + i
  let text = 'timetype_' + i
  let arVals = [code, lang, ttgrp, text, '\n']
  return arVals.join(',')
}

const injectRecords = (type, nElem) => {
  let s = ''
  for (let i = 0; i < nElem; i++) {
    switch (type) {
      case 'RECORDS': s += injectRecord(i); break
      case 'TTYPES': s += injectTimeType(i); break
    }
  }
  return s
}
const getFileContent = (type, nElem) => {
  let s = ''
  switch (type) {
    case 'RECORDS': s += 'ID,CODE,NAME,CARD,LANGUAGE,TTGROUP,ACCESGROUP,START,END\n'; break
    case 'TTYPES': s += 'CODE,LANGUAGE,TTGROUP,TEXT\n'; break
  }
  s += injectRecords(type, nElem)
  return s
}

// Creates a parametrized import file saves stores it into  /stress_test/exchange_sources
const createImportFile = (fileName, type, numElements) => {
  console.log('>> stress_test: createImportFile: ' + fileName + ' ' + type + ' ' + numElements)

  fs.writeFileSync(destPath + fileName, getFileContent(type, numElements))
}

// Creates a group of parametrized import files to use for testing performance
const createStressTestImportFiles = () => {
  console.log('>> stress_test: createStressTestImportFiles')
  createImportFile('RECORDS_20.txt', 'RECORDS', 20)
  createImportFile('TTYPES_20.txt', 'TTYPES', 20)
}

console.log('>> stress_test: preparing...')

const readConfigFile = () => {
  let routeCfg = process.cwd()
  cfg = JSON.parse(fs.readFileSync(routeCfg + '/test/stress_test/config.json', 'utf8'))
  console.log('environment= ' + JSON.stringify(cfg))
  destPath = cfg.exchange.files.sources + '\\'
  console.log('destPath = ' + destPath)
}

const init = () => {
  readConfigFile()
  createStressTestImportFiles()
}

init()

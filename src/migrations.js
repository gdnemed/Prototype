/* global process, require, module */
// -------------------------------------------------------------------------------------------
// Handles all app Knex migrations (creation of BD via knex for every environtment)
// -------------------------------------------------------------------------------------------
const log = require('./utils/log').getLogger('migrations')
const Knex = require('knex')
const g = require('./global')

// Each 'section' correspond to a folder inside /db/migrations
const SECTIONS = {
  STATE: 'state',
  OBJECTS: 'objects',
  INPUTS: 'inputs'
}

// sqlite, oracle, sqlserver, etc.
let dbType

// Customer name
let customerName

// Year of inputs migration
let yearMigration

const getDirForSqliteDB = () => {
  let environment = process.env.NODE_ENV || 'development'
  let dir = g.getConfig().db.dir
  switch (environment) {
    case 'stress_test': return dir + '/stress_test/' + customerName + '/'
    case 'test': return dir + '/test/' + customerName + '/'
    default: return dir + '/' + customerName + '/'
  }
}

// Executes the migration for the section, returning the implicit Promise of knex.migrate()
const migrateSection = (section, dbs, year) => {
  return new Promise((resolve, reject) => {
    // Base object for composing other specific objects via "object.assing"
    let baseMigration
    switch (dbType) {
      case 'sqlite':
        baseMigration = {
          client: 'sqlite3',
          useNullAsDefault: true
        }
        break
      case 'oracle':
        baseMigration = {
          client: 'oracledb',
          connection: {
            host: '172.18.6.3',
            user: 'lemuria',
            password: 'manager',
            database: 'spec'
          },
          useNullAsDefault: true
        }
        break
      case 'sqlserver':
        baseMigration = {
          client: 'mssql',
          connection: {
            host: '172.18.6.201',
            user: 'lemuria',
            password: 'spec',
            database: 'lemuria'
          },
          useNullAsDefault: true
        }
        break
      case 'mariadb':
        baseMigration = {
          client: 'mariasql',
          connection: {
            host: 'localhost',
            user: 'lemuria',
            password: 'spec',
            db: 'lemuria',
            charset: 'utf8'
          },
          useNullAsDefault: true
        }
        break
      case 'mysql':
        baseMigration = {
          client: 'mysql',
          connection: {
            host: 'localhost',
            user: 'lemuria',
            password: 'spec',
            database: 'lemuria'
          },
          useNullAsDefault: true
        }
        break
    }
    if (year) {
      yearMigration = '' + year
      baseMigration.year = yearMigration
    }
    let inputsSuffix = ''
    if (section === 'inputs') {
      inputsSuffix = '_' + yearMigration.substring(0, 4)
    }
    let cfg = Object.assign({}, baseMigration)
    Object.assign(cfg, {
      connection: {filename: `${getDirForSqliteDB()}M_${section}${inputsSuffix}.db`},
      migrations: {directory: `${__dirname}/../db/migrations/${section}`}
    })
    let sec = year ? section + year : section
    dbs[sec] = Knex(cfg)
    log.debug(`Invoking knex.migrate.latest() for ${sec}`)
    dbs[sec].migrate.latest().then((result) => {
      log.trace(`${sec} migration done: ${result}`)
      resolve()
    })
      .catch((err) => {
        reject(err)
      })
  })
}

// Executes the migration for all sections and returns a promise with the  'dbs' object
// If an error occurs in some process,
const init = (type, customer, year) => {
  // migrateSection() already returns a promise that refers to the result of "migrateSection()" invocation
  // But we want "init()" to return a promise with another value (the "dbs" object holding the N knex references)
  // A way to do this is creating a new Promise and resolve() or reject() it depending on the case
  // see => https://www.promisejs.org
  return new Promise((resolve, reject) => {
    log.info('info: migrations.init() : customer: ' + customer + ' type: ' + type)
    dbType = type
    customerName = customer
    // Object that holds a reference to every section knex object
    let dbs = {}
    migrateSection(SECTIONS.STATE, dbs)
      .then(() => migrateSection(SECTIONS.OBJECTS, dbs))
      .then(() => initYear(type, customer, year - 1, dbs))
      .then(() => initYear(type, customer, year + 1, dbs))
      .then(() => initYear(type, customer, year, dbs))
      .then(() => resolve(dbs))
      .catch((err) => reject(err))
  })
}

const initYear = (type, customer, year, dbs) => {
  log.info('info: migrations.initYear() : customer: ' + customer + ' year: ' + year)
  dbType = type
  customerName = customer
  return migrateSection(SECTIONS.INPUTS, dbs, year)
}
module.exports = {
  init,
  initYear
}

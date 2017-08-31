/* global process, require, module */
// -------------------------------------------------------------------------------------------
// Handles all app Knex migrations (creation of BD via knex for every environtment)
// -------------------------------------------------------------------------------------------
const log = require('./utils/log').getLogger('migrations')
const Knex = require('knex')
const g = require('./global')
const inputsMigrations = require('../db/migrations/inputs/inputs_migration')

// Each 'section' correspond to a folder inside /db/migrations
const SECTIONS = {
  STATE: 'state',
  OBJECTS: 'objects',
  INPUTS: 'inputs'
}

// Year of inputs migration
let yearMigration

const getDirForSqliteDB = (customerName) => {
  let environment = process.env.NODE_ENV || 'development'
  let dir = g.getConfig().db.dir
  switch (environment) {
    case 'stress_test': return dir + '/stress_test/' + customerName + '/'
    case 'test': return dir + '/test/' + customerName + '/'
    default: return dir + '/' + customerName + '/'
  }
}

// Executes the migration for the section, returning the implicit Promise of knex.migrate()
const migrateSection = (dbType, customerName, section, dbs, year) => {
  return new Promise((resolve, reject) => {
    connect(dbType, customerName, section, dbs, year)
      .then((sec) => {
        log.debug(`Invoking knex.migrate.latest() for ${sec}`)
        dbs[sec].migrate.latest()
          .then((result) => {
            log.trace(`${sec} migration done: ${result}`)
            resolve()
          })
          .catch(reject)
      })
      .catch(reject)
  })
}

const connect = (dbType, customerName, section, dbs, year) => {
  return new Promise((resolve, reject) => {
    try {
      // Base object for composing other specific objects via "object.assing"
      let baseMigration
      switch (dbType) {
        case 'sqlite3':
          baseMigration = {
            client: 'sqlite3',
            useNullAsDefault: true
          }
          break
        case 'oracledb':
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
        case 'mssql':
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
        case 'mariasql':
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
      baseMigration.customer = customerName
      if (year) {
        yearMigration = '' + year
        baseMigration.year = yearMigration
      }
      let inputsSuffix = ''
      if (section === 'inputs') {
        inputsSuffix = '_' + yearMigration.substring(0, 4)
        baseMigration.months = {}
      }
      let cfg = Object.assign({}, baseMigration)
      Object.assign(cfg, {
        connection: {filename: `${getDirForSqliteDB(customerName)}M_${section}${inputsSuffix}.db`},
        migrations: {directory: `${__dirname}/../db/migrations/${section}`}
      })
      let sec = year ? section + year : section
      dbs[sec] = Knex(cfg)
      resolve(sec)
    } catch (err) {
      reject(err)
    }
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
    // Object that holds a reference to every section knex object
    let dbs = {}
    migrateSection(type, customer, SECTIONS.STATE, dbs)
      .then(() => migrateSection(type, customer, SECTIONS.OBJECTS, dbs))
      .then(() => initYear(type, customer, year, dbs))
      .then(() => initYear(type, customer, year + 1, dbs))
      .then(() => initYear(type, customer, year - 1, dbs))
      .then(() => resolve(dbs))
      .catch((err) => reject(err))
  })
}

const initYear = (type, customer, year, dbs) => {
  log.info('info: migrations.initYear() : customer: ' + customer + ' year: ' + year)
  return migrateSection(type, customer, SECTIONS.INPUTS, dbs, year)
}

// debug: verifies that each knex object for each db exists
const verifyDB = (dbs) => {
  return new Promise((resolve, reject) => {
    log.info('Verifying migration')
    let year = new Date().getFullYear()
    let kState = dbs['state']
    let kObjects = dbs['objects']
    kState.select().table('settings')
      .then((collection) => {
        log.debug('settings len  = ' + collection.length)
        return kObjects.select().table('entity_1')
      })
      .then((collection) => {
        log.debug('entity_1 len  = ' + collection.length)
        return inputsMigrations.verifyYear(dbs, year - 1, log)
      })
      .then(() => inputsMigrations.verifyYear(dbs, year, log))
      .then(() => inputsMigrations.verifyYear(dbs, year + 1, log))
      .then(resolve)
      .catch(reject)
  })
}

module.exports = {
  init,
  initYear,
  verifyDB,
  connect
}

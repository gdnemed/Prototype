/* global process, require, module */
// -------------------------------------------------------------------------------------------
// Handles all app Knex migrations (creation of BD via knex for every environtment)
// -------------------------------------------------------------------------------------------
const fs = require('fs')
const log = require('./utils/log').getLogger('migrations')
const Knex = require('knex')
const g = require('./global')
const inputsMigrations = require('./db/migrations/inputs/inputs_migration')

// Each 'section' correspond to a folder inside /db/migrations
const SECTIONS = {
  STATE: 'state',
  OBJECTS: 'objects',
  INPUTS: 'inputs'
}

// Year of inputs migration
let yearMigration

// In testing cases, sqlite db files location is forced to the HOME dir (where the configuration is)
const _testGetDirForSqliteDB = (customerName) => {
  // Checking: Path: test/scenarios/[SCENARIO_NAME]/db/
  let sqlitePartialPath = g.getConfig().home + '/db/'
  try {
    if (!fs.existsSync(sqlitePartialPath)) {
      log.debug(`Creating directory for SQlite db : ${sqlitePartialPath}`)
      fs.mkdirSync(sqlitePartialPath)
    }
  } catch (err) {
    console.log(`Creating directory for SQlite db : ${err.message}`)
  }
  // Checking: Path: test/scenarios/[SCENARIO_NAME]/db/[customerName]
  let sqliteCompletePath = sqlitePartialPath + customerName + '/'
  try {
    if (!fs.existsSync(sqliteCompletePath)) {
      log.debug(`Creating directory for SQlite db : ${sqliteCompletePath}`)
      fs.mkdirSync(sqliteCompletePath)
    }
  } catch (err) {
    console.log(`Creating directory for SQlite db : ${err.message}`)
  }
  return sqliteCompletePath
}

const getDirForSqliteDB = (customerName) => {
  // Test mode
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'stress_test') { return _testGetDirForSqliteDB(customerName) }
  // Development or production modes
  let dir = process.env.LEMURIA_DIR_DB
  let sqlitePath = dir + '/' + customerName + '/'
  try {
    if (!fs.existsSync(sqlitePath)) {
      log.debug(`Creating directory for SQlite db : ${sqlitePath}`)
      fs.mkdirSync(sqlitePath)
    }
  } catch (err) {
    console.log(`Creating directory for SQlite db : ${err.message}`)
  }
  return sqlitePath
}

// Executes the migration for the section, returning the implicit Promise of knex.migrate()
const migrateSection = (customer, section, dbs, year) => {
  return new Promise((resolve, reject) => {
    connect(true, customer, section, dbs, year)
      .then((sec) => {
        // Global service must do migrations
        if (g.isLocalService('global')) {
          log.debug(`Invoking knex.migrate.latest() for ${sec}`)
          dbs[sec].migrate.latest()
            .then((result) => {
              log.trace(`${sec} migration done: ${result}`)
              // resolve()
            })
            .then(() => {
              log.trace(`${sec} post-migration cleaning metadata ...`)
              cleanMigrationMetadata(customer.name, sec, dbs)
            })
            .then(() => {
              resolve()
            })
            .catch(reject)
        } else resolve()
      })
      .catch(reject)
  })
}

const connect = (createIfNotExists, customer, section, dbs, year) => {
  return new Promise((resolve, reject) => {
    try {
      // Base object for composing other specific objects via "object.assing"
      let baseMigration

      /*
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
        migrations: {directory: `${__dirname}/db/migrations/${section}`}
      })
      let sec = year ? section + year : section
      */

      if (!customer.hasOwnProperty('db')) {
        reject(new Error('There is db entry for ' + customer.name))
        return
      }
      baseMigration = customer.db[section]
      if (!baseMigration) {
        reject(new Error('There is no connection data for ' + section + ' in ' + customer.name))
        return
      }
      baseMigration.customer = customer.name

      if (year) {
        yearMigration = '' + year
        baseMigration.year = yearMigration
      }
      let inputsSuffix = ''
      if (section === 'inputs') {
        inputsSuffix = '_' + yearMigration.substring(0, 4)
        baseMigration.months = {}
      }

      // Set config connection data.
      let cfg = Object.assign({}, baseMigration)
      cfg.migrations = {}
      cfg.migrations.directory = `${__dirname}/db/migrations/${section}`

      if (cfg.client === 'sqlite3') {
        if (!cfg.hasOwnProperty('connection')) {
          cfg.connection = {}
        }
        cfg.connection.filename = `${getDirForSqliteDB(customer.name)}M_${section}${inputsSuffix}.db`
      }

      let sec = year ? section + year : section

      if (!createIfNotExists && baseMigration.client === 'sqlite3') {
        fs.access(cfg.connection.filename, fs.constants.R_OK | fs.constants.W_OK, (err) => {
          if (err) resolve(null)
          else {
            dbs[sec] = Knex(cfg)
            resolve(sec)
          }
        })
      } else dbs[sec] = Knex(cfg)
      resolve(sec)
    } catch (err) {
      reject(err)
    }
  })
}

// Executes the migration for all sections and returns a promise with the  'dbs' object
// If an error occurs in some process,
const init = (customer, year) => {
  // migrateSection() already returns a promise that refers to the result of "migrateSection()" invocation
  // But we want "init()" to return a promise with another value (the "dbs" object holding the N knex references)
  // A way to do this is creating a new Promise and resolve() or reject() it depending on the case
  // see => https://www.promisejs.org
  return new Promise((resolve, reject) => {
    log.info('info: migrations.init() : customer: ' + customer.name)
    // Object that holds a reference to every section knex object
    let dbs = {}
    migrateSection(customer, SECTIONS.STATE, dbs)
      .then(() => migrateSection(customer, SECTIONS.OBJECTS, dbs))
      .then(() => initYear(customer, year - 1, dbs))
      .then(() => initYear(customer, year, dbs))
      .then(() => initYear(customer, year + 1, dbs))
      .then(() => resolve(dbs))
      .catch((err) => reject(err))
  })
}

const initYear = (customer, year, dbs) => {
  log.info('info: migrations.initYear() : customer: ' + customer.name + ' year: ' + year)
  return migrateSection(customer, SECTIONS.INPUTS, dbs, year)
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

/*
 *  Migration process checks on db if there is any import file that doesn't exists on current
 *  working directory. We must clean table after migration process to manage different sections.
 */
const cleanMigrationMetadata = (customerName, section, dbs) => {
  return new Promise((resolve, reject) => {
    dbs[section].schema.hasTable('knex_migrations')
      .then((exists) => {
        if (exists) {
          dbs[section]('knex_migrations').truncate()
            .then(resolve())
          log.trace(`${customerName} ${section} : knex_migrations table truncated.`)
        } else {
          log.trace(`${customerName} ${section} : knex_migrations table does not exists.`)
          resolve()
        }
      })
      .catch((err) => reject(err))
  })
}

/*
 *  Migration ROLLBACK process checks on db file to rollback
 */
const addMigrationMetadata = (customerName, section, dbs, file) => {
  return new Promise((resolve, reject) => {
    dbs[section].schema.hasTable('knex_migrations')
      .then((exists) => {
        if (exists) {
          let rollbackRegister = {
            batch: '1',
            migration_time: new Date().toISOString(),
            name: file
          }
          dbs[section].insert(rollbackRegister).into('knex_migrations').then(resolve())
          log.trace(`${customerName} ${section} : knex_migrations table load with rollback file.`)
        } else {
          log.trace(`${customerName} ${section} : knex_migrations table does not exists.`)
          resolve()
        }
      })
      .catch((err) => reject(err))
  })
}

module.exports = {
  init,
  initYear,
  verifyDB,
  connect,
  cleanMigrationMetadata,
  addMigrationMetadata
}

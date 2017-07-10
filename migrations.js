/* global process, require, module */
// -------------------------------------------------------------------------------------------
// Handles all app Knex migrations (creation of BD via knex for every environtment)
// -------------------------------------------------------------------------------------------
const loggerMachine = require('./utils/log')
const logger = loggerMachine.getLogger('migrations')
const Knex = require('knex')

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

// Object that holds a reference to every section knex object
let knexRefs = {}

const getDirForSqliteDB = () => {
  let environment = process.env.NODE_ENV || 'development'
  switch (environment) {
    case 'test': return './db/test/' + customerName + '/'
    default: return './db/' + customerName + '/'
  }
}

// Executes the migration for the section, returning the implicit Promise of knex.migrate()
const migrateSection = (section) => {
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
  baseMigration.year = yearMigration
  let inputsSuffix = ''
  if (section === 'inputs') {
    inputsSuffix = '_' + yearMigration.substring(0,4)
  }
  let cfg = Object.assign({}, baseMigration)
  Object.assign(cfg, {
    connection: {filename: getDirForSqliteDB() + `M_${section}${inputsSuffix}.db`},
    migrations: {directory: `./db/migrations/${section}`}
  })
  // let knex = Knex(cfg)
  knexRefs[section] = Knex(cfg)
  logger.debug(`Invoking knex.migrate.latest() for ${section}`)
  return knexRefs[section].migrate.latest().then((result) => {
    logger.trace(`${section} migration done: ${result}`)
  })
}

// Executes the migration for all sections and returns a promise with the  'knexRefs' object
// If an error occurs in some process,
const init = (type, customer, year) => {
  logger.info('info: migrations.init()')
  dbType = type
  customerName = customer
  yearMigration = year
  // migrateSection() already returns a promise that refers to the result of "migrateSection()" invocation
  // But we want "init()" to return a promise with another value (the "knexRefs" object holding the N knex references)
  // A way to do this is creating a new Promise and resolve() or reject() it depending on the case
  // see => https://www.promisejs.org
  return new Promise((resolve, reject) => {
    migrateSection(SECTIONS.STATE)
      .then(() => migrateSection(SECTIONS.OBJECTS))
      .then(() => migrateSection(SECTIONS.INPUTS))
      .then(() => resolve(knexRefs))
      .catch((err) => reject(err))
  })
}

module.exports = {
  init
}

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

// Object that holds a reference to every section knex object
let knexRefs = {}

const getDirForMigration = () => {
  let environment = process.env.NODE_ENV || 'development'
  switch (environment) {
    case 'test': return './db/test/'
    default: return './db/'
  }
}

// Executes the migration for the section, returning the implicit Promise of knex.migrate()
const migrateSection = (section) => {
  // Base object for composing other specific objects via "object.assing"
  const baseMigration = {
    client: 'sqlite3',
    useNullAsDefault: true
  }
  let cfg = Object.assign({}, baseMigration)
  Object.assign(cfg, {
    connection: {filename: getDirForMigration() + `M_${section}.db`},
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
const init = () => {
  logger.info('info: migrations.init()')

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

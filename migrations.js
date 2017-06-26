
// -------------------------------------------------------------------------------------------
// Handles all app Knex migrations (creation of BD via knex for every environtment)
// -------------------------------------------------------------------------------------------
const loggerMachine = require('./utils/log')
const logger = loggerMachine.getLogger('migrations')

const Knex = require('knex')
// const knexConfig = require('./knexfile')

const init = () => {
  logger.info('info: migrations.init()')
  logger.trace('trace: migrations.init()')
  logger.debug('trace: migrations.init()')

  // OK (via configuration)
  /*
  let environment = process.env.NODE_ENV || 'development'
  logger.info('Initializing knex for environment = ' + environment)

   const knex = Knex(knexConfig[environment])
  knex.migrate.latest().then((result) => {
    logger.trace("EUREKA! migration done!" + result)
  }) */

  let baseMigration = {
    client: 'sqlite3',
    useNullAsDefault: true
  }

  /* let migrStateCfg = Object.assign({}, baseMigration)
  Object.assign(migrStateCfg, {
    connection: {filename: './db/lemuria_state.db'},
    migrations: {directory: './db/migrations/state'}
  })
  let knex = Knex(migrStateCfg)
  knex.migrate.latest().then((result) => {
    logger.trace('EUREKA! state_migration done! ' + result)
  })
*/

  const getDirForMigration = () => {
    let environment = process.env.NODE_ENV || 'development'
    logger.debug('getDirForMigration ENV = ' + environment)
    switch (environment) {
      case 'test': return './db/test/'
      default: return './db/'
    }
  }

  // Does "state" migration and returns a Promise
  const migrateState = () => {
    let migrStateCfg = Object.assign({}, baseMigration)
    Object.assign(migrStateCfg, {
      connection: {filename: getDirForMigration() + 'M_state.db'},
      migrations: {directory: './db/migrations/state'}
    })
    let knex = Knex(migrStateCfg)
    logger.debug('Invoking knex.migrate.latest() for state')
    return knex.migrate.latest().then((result) => {
      logger.trace('state_migration done! ' + result)
    })
  }

  // Does "objects" migration and returns a Promise
  const migrateObjects = () => {
    let migrObjectsCfg = Object.assign({}, baseMigration)
    Object.assign(migrObjectsCfg, {
      connection: {filename: getDirForMigration() + 'M_objects.db'},
      migrations: {directory: './db/migrations/objects'}
    })
    let knex = Knex(migrObjectsCfg)
    logger.debug('Invoking knex.migrate.latest() for objects')
    return knex.migrate.latest().then((result) => {
      logger.trace('objects_migration done! ' + result)
    })
  }

  // Migretes sequentially state, objects, entities (one after the other)
  return migrateState()
    .then(() => migrateObjects())
}

module.exports = {
  init
}

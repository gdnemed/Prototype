
// -------------------------------------------------------------------------------------------
// Handles all app Knex migrations (creation of BD via knex for every environtment)
// -------------------------------------------------------------------------------------------
const loggerMachine = require('./utils/log')
const logger = loggerMachine.getLogger('migrations')

const Knex = require('knex')

const SECTIONS = {
  STATE: 'state',
  OBJECTS: 'objects',
  INPUTS: 'inputs'
}


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
  let knex = Knex(cfg)
  logger.debug(`Invoking knex.migrate.latest() for ${section}`)
  return knex.migrate.latest().then((result) => {
    logger.trace(`${section} migration done: ${result}`)
  })
}

const init = () => {
  logger.info('info: migrations.init()')

  return migrateSection(SECTIONS.STATE)
    .then(() => migrateSection(SECTIONS.OBJECTS))
    .then(() => migrateSection(SECTIONS.INPUTS))
}

module.exports = {
  init
}

// -------------------------------------------------------------------------------------------
// Database utils
// -------------------------------------------------------------------------------------------

const sqlite = require('sqlite3')
const fs = require('fs')

const CT = require('../CT')
const loggerMachine = require('./log')
const logger = loggerMachine.getLogger('db')

/*
Connects with a SQLite database in a location specified by DB_PATH, customer name.
If the directory or the database don't exist, creates them.
The database name is a composition of "prefix_nodeId_sufix.db"
*/
const createDatabase = (customer, prefix, nodeId, sufix) => {
  let sNode = nodeId ? '_' + nodeId : ''
  if (sufix) {
    sNode += '_' + sufix
  }

    // Checks if directory exists, and otherwise creates (all sync operations)
  let dbPath = CT.DB_PATH + customer + '/'
  if (!fs.existsSync(dbPath)) {
    logger.info('createDatabase: creating directory: ' + dbPath)
    fs.mkdirSync(dbPath)
  }
  let pathName = dbPath + prefix + sNode + '.db'

  return new sqlite.Database(pathName, function (err) {
    if (err) {
      logger.fatal('ERROR in createDatabase ' + pathName + ' : ' + err.message)
      loggerMachine.exit()
    } else {
      logger.info('Connected to database: ' + pathName)
    }
  })
}

module.exports = {

  createDatabase: createDatabase

}

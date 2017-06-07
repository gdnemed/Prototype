// -------------------------------------------------------------------------------------------
// Database utils
// -------------------------------------------------------------------------------------------
const sqlite = require('sqlite3'), CT = require('../CT'), fs = require('fs')

// Creates a SQLite database in a location specified by DB_PATH, customer name. If the directory doesn't exists, creates it.
// The database name is a composition of "prefix_nodeId_sufix.db"
const createDatabase = (customer, prefix, nodeId, sufix) => {
  let sNode = nodeId ? '_' + nodeId : ''
  if (sufix) {
    sNode += '_' + sufix
  }

    // Checks if directory exists, and otherwise creates (all sync operations)
  let dbPath = CT.DB_PATH + customer + '/'
  if (!fs.existsSync(dbPath)) {
    console.log('createDatabase: creating directory: ' + dbPath)
    fs.mkdirSync(dbPath)
  }
  let pathName = dbPath + prefix + sNode + '.db'

  return new sqlite.Database(pathName, function (err) {
    if (err) {
      console.log('ERROR in createDatabase: ' + err.message)
      process.exit(0)
    } else {
      console.log('createDatabase: ' + pathName + ' created')
    }
  })
}

module.exports = {

  createDatabase: createDatabase

}

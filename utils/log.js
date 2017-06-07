// -------------------------------------------------------------------------------------------
// Logging module.
// -------------------------------------------------------------------------------------------

const log4js = require('log4js')

/*
Initial logging configuration, from a file.
*/
const configure = () => {
  try {
    log4js.configure(JSON.parse(fs.readFileSync('./logging.json', 'utf8')))
  } catch (err) {
    console.log('logging.json not found, log messages sent to stdout.')
  }
}

/*
Returns logger associated to a target.
target: User defined name to classify.
return: Logger object.
*/
const getLogger = (target) => { return log4js.getLogger(target) }

/*
Main function for logging.
level: error, warning, information, debug
message: Log text.
*/
function log (level, message) {

}

/*
Exits the program, after closing every log output.
*/
const exit = () => {
  log4js.shutdown(() => { process.exit(0) })
}

module.exports = {

  configure: configure,
  getLogger: getLogger,
  log: log,
  exit: exit

}

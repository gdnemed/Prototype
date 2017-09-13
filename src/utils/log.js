// -------------------------------------------------------------------------------------------
// Logging module.
// -------------------------------------------------------------------------------------------

const log4js = require('log4js')
const fs = require('fs')

let configured = false
let customized = false

/*
Initial logging configuration, from a file.
*/
const configure = () => {
  try {
    log4js.configure(JSON.parse(fs.readFileSync(process.env.HOME + '/logging.json', 'utf8')))
    customized = true
  } catch (err) {
    console.log('logging.json not found, log messages sent to stdout.')
  }
  configured = true
}

/*
Returns logger associated to a target.
target: User defined name to classify.
return: Logger object.
*/
const getLogger = (target) => {
  if (!configured) configure()
  let l = log4js.getLogger(target)
  if (!customized) { // Default configuration when no 'HOME/logging.json' file is found
    l.level = 'trace'
  }
  return l
}

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

require('dotenv').config()
require('./src/defaults').addDefaults()
// If passed as an argument, override
if (process.argv.indexOf('--home') !== -1) {
  process.env.HOME = process.argv[process.argv.indexOf('--home') + 1]
  console.log('Lemuria init at ' + process.env.HOME)
} else if (process.argv.indexOf('--url') === -1) {
  console.log('Init parameter needed: --home or --url')
  process.exit()
}

module.exports = require('./src/lemuria')

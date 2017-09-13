require('dotenv').config()
require('./src/defaults').addDefaults()
// If passed as an argument, override
if (process.argv.indexOf('--home') !== -1) {
  process.env.HOME = process.argv[process.argv.indexOf('--home') + 1]
  console.log('Lemuria init at ' + process.env.HOME)
} else {
  console.log('home variable required')
  process.exit()
}

module.exports = require('./src/lemuria')

let lemuria = require('./terminal')
console.log(process.argv)
lemuria.init(parseInt(process.argv[2]), process.argv[3], parseInt(process.argv[4]))

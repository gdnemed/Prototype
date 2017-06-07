// -------------------------------------------------------------------------------------------
// Inputs database management.
// -CRUD of every input.
// -Creates and mantains input tables.
// -------------------------------------------------------------------------------------------

const utilsDb = require.main.require('./utils/db.js')
const loggerMachine = require.main.require('./utils/log')
const logger = loggerMachine.getLogger('db')

var dbs = {}
var nodeId
var currentId

exports.init = function (node, customers) {
  nodeId = node
  for (var i = 0; i < customers.length; i++) {
    dbs[customers[i]] = initDB(customers[i])
  }
}

function initDB (customer) {
  var db = utilsDb.createDatabase(customer, 'inputs', nodeId, '2017')
  db.run('CREATE TABLE if not exists input_' + nodeId + '_201705 ' +
  '(id integer, tmp integer, gmt integer, reception integer, ' +
  'owner integer, result integer, source integer, serial text)')
  db.run('CREATE TABLE if not exists input_data_str_' + nodeId + '_201705 ' +
  '(id integer, property integer, value text)', function () {
    db.run('CREATE INDEX if not exists i_input_data_str_' +
    nodeId + '_201705_p on input_data_str_' + nodeId + '_201705 (property)')
    db.run('CREATE INDEX if not exists i_input_data_str_' +
    nodeId + '_201705_i on input_data_str_' + nodeId + '_201705 (id)')
  })
  db.run('CREATE TABLE if not exists input_data_num_' + nodeId + '_201705 ' +
  '(id integer, property integer, value integer)', function () {
    db.run('CREATE INDEX if not exists i_input_data_num_' +
    nodeId + '_201705_p on input_data_num_' + nodeId + '_201705 (property)')
    db.run('CREATE INDEX if not exists i_input_data_num_' +
    nodeId + '_201705_i on input_data_num_' + nodeId + '_201705 (id)')
  })
  db.run('CREATE TABLE if not exists input_data_bin_' + nodeId + '_201705 ' +
  '(id integer, property integer, value blob)', function () {
    db.run('CREATE INDEX if not exists i_input_data_bin_' +
    nodeId + '_201705_p on input_data_bin_' + nodeId + '_201705 (property)')
    db.run('CREATE INDEX if not exists i_input_data_bin_' +
    nodeId + '_201705_i on input_data_bin_' + nodeId + '_201705 (id)')
  })
  db.run('CREATE TABLE if not exists input_rel_' + nodeId + '_201705 ' +
  '(id integer, relation integer, entity integer)', function () {
    db.run('CREATE INDEX if not exists i_input_rel_' +
    nodeId + '_201705_r on input_rel_' + nodeId + '_201705 (relation)')
    db.run('CREATE INDEX if not exists i_input_rel_' +
    nodeId + '_201705_i on input_rel_' + nodeId + '_201705 (id)')
  })
  db.run('CREATE TABLE if not exists local_id(id integer)', [], function (err) {
    if (err) {
      logger.fatal(err.message)
      loggerMachine.exit()
    }
    db.all('SELECT id from local_id', [], function (err, rows) {
      if (err) {
        logger.getLogger('main').fatal(err.message)
        logger.exit()
      }
      if (rows == null || rows.length === 0) {
        db.run('INSERT INTO local_id(id) values (1)', [], function (e) {
          if (err) {
            logger.fatal(err.message)
            loggerMachine.exit()
          } else currentId = 1
        })
      } else currentId = rows[0].id
    })
  })
  return db
}

exports.get_inputs = function (customer, callback) {
  var db = dbs[customer]
  var res = [null, null]
  db.all('SELECT * from input_' + nodeId + '_201705', function (err, rows) {
    if (err) callback(err)
    else {
      res[0] = rows
      db.all('SELECT * from input_data_str_' + nodeId + '_201705', function (err, rows) {
        if (err) callback(err)
        else {
          res[1] = rows
          callback(null, res)
        }
      })
    }
  })
}

// this is so specific fot test
exports.get_inputs_complete = function (customer, callback) {
  var db = dbs[customer]
  db.all("select b.*,c.record from (SELECT i.id,tmp,result,a.card, 'lect1' reader from input_" +
nodeId + '_201705 i left join (select id,value card from input_data_str_' +
nodeId + "_201705 where property='card') a on a.id=i.id) b left join " +
'(select id,value record from input_data_str_' +
nodeId + "_201705 where property='record') c on b.id=c.id", callback)
}

exports.create_clocking = function (clocking, customer, callback) {
  if (currentId == null) {
    callback(new Error('Service unavailable'))
    return
  }
  var db = dbs[customer]
  var params = [currentId, clocking.tmp, clocking.gmt, clocking.reception,
    clocking.owner, clocking.source, clocking.result, clocking.serial]
  currentId++
  db.run('UPDATE local_id set id=?', [currentId], function (err) {
    if (err) {
      logger.fatal(err.message)
      loggerMachine.exit()
    }
  })
  var properties = []
  if (clocking.card) properties.push({property: 'card', value: clocking.card})
  if (clocking.record) properties.push({property: 'record', value: clocking.record})
  db.run('BEGIN TRANSACTION', function (err) {
    if (err) callback(err)
    else {
      db.run('INSERT INTO input_' + nodeId + '_201705 ' +
      '(id,tmp,gmt,reception,owner,source,result,serial) VALUES (?,?,?,?,?,?,?,?)',
        params,
        function (err) {
          if (err) {
            db.run('ROLLBACK')
            callback(err)
          } else setInputData(db, params[0], properties, 0, callback)
        }
      )
    }
  })
}

function setInputData (db, id, properties, i, callback) {
  if (i >= properties.length) commit(db, callback)
  else {
    db.run('INSERT INTO input_data_str_' + nodeId + '_201705 (id,property,value) values (?,?,?)',
      [id, properties[i].property, properties[i].value],
      function (err) {
        if (err) {
          db.run('ROLLBACK')
          callback(err)
        } else setInputData(db, id, properties, i + 1, callback)
      })
  }
}

function commit (db, callback) {
  db.run('COMMIT', function (err) {
    if (err) {
      db.run('ROLLBACK')
      callback(err)
    } else callback()
  })
}

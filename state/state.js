var utilsDb = require('../utils/db.js')
var dbs = {}
var node_id
var current_id

exports.init = function (customers) {
  node_id = 1
  for (var i = 0; i < customers.length; i++) { dbs[customers[i]] = init_db(customers[i]) }
}

function init_db (customer) {
  var db = utilsDb.createDatabase(customer, 'state')
  db.run('CREATE TABLE if not exists settings (var text, code text)')
  db.run('CREATE TABLE if not exists global_id(id integer)', [], function (err) {
    if (err) {
      console.log(err.message)
      process.exit(0)
    }
    db.all('SELECT id from global_id', [], function (err, rows) {
      if (err) {
        console.log(err.message)
        process.exit(0)
      }
      if (rows == null || rows.length == 0) {
        db.run('INSERT INTO global_id(id) values (1)', [], function (e) {
          if (e) {
            console.log(e.message)
            process.exit(0)
          } else current_id = 1
        })
      } else current_id = rows[0].id
    })
  })
  return db
}

exports.new_id = function (customer, callback) {
  if (current_id == undefined) callback(new Error('not ready'))
  else {
    var db = dbs[customer]
    db.run('UPDATE global_id set id=id+1', [], function (err, rows) {
      current_id++
      callback(err, current_id)
    })
  }
}

exports.get_settings = function (req, res) {
  select_settings('SPEC', function (err, result) {
    if (err)res.status(500).end(err.message)
    else res.status(200).jsonp(result)
  })
}

select_settings = function (customer, callback) {
  var db = dbs[customer]
  db.all('SELECT setting,value from settings', [], function (err, rows) {
    if (err) callback(err)
    else {
      var ret = {}
      for (var i = 0; i < rows.length; i++) ret[rows[i].setting] = rows[i].value
      callback(null, ret)
    }
  })
}

exports.post_settings = function (req, res) {
  update_settings('SPEC', req.body, function (err, result) {
    if (err)res.status(500).end(err.message)
    else res.status(200).jsonp(result)
  })
}

update_settings = function (customer, settings, callback) {
  var db = dbs[customer]
  var l = []
  for (var property in settings) {
    if (settings.hasOwnProperty(property)) { l.push({setting: property, value: settings[property]}) }
  }
  put_setting_item(db, l, 0, callback)
}

function put_setting_item (db, l, i, callback) {
  if (i >= l.length) callback()
  else {
    var setting = l[i].setting
    var value = l[i].value
    db.all('SELECT value from settings where setting=?', [setting], function (err, rows) {
      if (err) callback(err)
      else if (rows == null || rows.length == 0) {
        db.run('INSERT INTO settings(setting,value) values (?,?)', [setting, value], function (err) {
          if (err) callback(err)
          else put_setting_item(db, l, i + 1, callback)
        })
      } else {
        db.run('UPDATE settings set value=? where setting=?', [value, setting], function (err) {
          if (err) callback(err)
          else put_setting_item(db, l, i + 1, callback)
        })
      }
    })
  }
}

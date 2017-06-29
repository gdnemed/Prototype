var utilsDb = require('../utils/db.js')
var sequences = {}

const newId = (session, callback) => {
  if (sequences[session.name]) callback(null, sequences[session.name]++)
  else {
    session.dbs['objects'].select('max(id)').from('entity_1')
      .then((rows) => {
        if (rows.length === 0) sequences[session.name] = 1
        else sequences[session.name] = rows[0] + 1
        callback(null, sequences[session.name]++)
      })
      .catch((err) => callback(err))
  }
}

const get_settings = (req, res) => {
  select_settings('SPEC', function (err, result) {
    if (err)res.status(500).end(err.message)
    else res.status(200).jsonp(result)
  })
}

const select_settings = (customer, callback) => {
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

const post_settings = (req, res) => {
  update_settings('SPEC', req.body, function (err, result) {
    if (err)res.status(500).end(err.message)
    else res.status(200).jsonp(result)
  })
}

const update_settings = (customer, settings, callback) => {
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

/*
Blocks entity type, to preserve keys.
 - session: API session
 - type: Entity type
*/
const blockType = (session, type, callback) => {
  callback()
}

/*
 Releases entity type.
 - session: API session
 - type: Entity type
 */
const releaseType = (session, entity, callback) => {
  callback()
}

module.exports = {

  post_settings: post_settings,
  get_settings: get_settings,
  newId: newId,
  blockType: blockType,
  releaseType: releaseType

}

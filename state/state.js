var sequences = {}
var inputSequences = {}

const newId = (session, callback) => {
  if (sequences[session.name]) callback(null, sequences[session.name]++)
  else {
    let db = session.dbs['objects']
    db('entity_1').max('id as m')
      .then((rows) => {
        if (rows.length === 0) sequences[session.name] = 1
        else sequences[session.name] = rows[0].m + 1
        callback(null, sequences[session.name]++)
      })
      .catch((err) => callback(err))
  }
}

const newInputId = (session, callback) => {
  if (inputSequences[session.name]) callback(null, inputSequences[session.name]++)
  else {
    // TODO: Select every table
    let db = session.dbs['inputs']
    db('input_1_201707').max('id as m')
      .then((rows) => {
        if (rows.length === 0) inputSequences[session.name] = 1
        else inputSequences[session.name] = rows[0].m + 1
        callback(null, inputSequences[session.name]++)
      })
      .catch((err) => callback(err))
  }
}

const getSettings = (req, res, session) => {
  let db = session.dbs['state']
  selectSettings(db, (err, result) => {
    if (err)res.status(500).end(err.message)
    else res.status(200).jsonp(result)
  })
}

const selectSettings = (db, callback) => {
  db.select('setting,value').from('settings').then((rows) => {
    let ret = {}
    for (var i = 0; i < rows.length; i++) ret[rows[i].setting] = rows[i].value
    callback(null, ret)
  })
  .catch((err) => callback(err))
}

const postSettings = (req, res, session) => {
  let db = session.dbs['state']
  updateSettings(db, req.body, function (err, result) {
    if (err)res.status(500).end(err.message)
    else res.status(200).jsonp(result)
  })
}

const updateSettings = (db, settings, callback) => {
  var l = []
  for (var property in settings) {
    if (settings.hasOwnProperty(property)) { l.push({setting: property, value: settings[property]}) }
  }
  putSettingItem(db, l, 0, callback)
}

function putSettingItem (db, l, i, callback) {
  if (i >= l.length) callback()
  else {
    var setting = l[i].setting
    var value = l[i].value
    db.select('value').from('settings').where('setting',setting)
      .then((rows) => {
        if (rows == null || rows.length === 0) {
          let o = {
            setting: setting,
            value: value
          }
          db.insert(o).into('settings')
            .then((rowid) => putSettingItem(db, l, i + 1, callback))
            .catch((err) => callback(err))
        } else {
          db('settings').update({value: value}).where('setting', setting)
            .then((count) => putSettingItem(db, l, i + 1, callback))
            .catch((err) => callback(err))
        }
      })
      .catch((err) => callback(err))
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

  post_settings: postSettings,
  getSettings: getSettings,
  newId: newId,
  newInputId: newInputId,
  blockType: blockType,
  releaseType: releaseType

}

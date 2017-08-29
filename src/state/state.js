/* global require, process */
// -------------------------------------------------------------------------------------------
// State module.
// -Implements API calls over global settings.
// -Generates id's for primary keys.
// -Blocks types to avoid concurrent actions over keys.
// -------------------------------------------------------------------------------------------

const logger = require('../utils/log')
const httpServer = require('../httpServer')
const sessions = require('../session/sessions')
const g = require('../global')

// Numeric sequences for id's (entities and inputs)
let sequences = {}
let inputSequences = {}
let log

// Map for entity types blocking (for key preservation)
let typesBlocks = {}

const newId = (session) => {
  return new Promise((resolve, reject) => {
    if (sequences[session.name]) resolve(sequences[session.name]++)
    else {
      let db = session.dbs['objects']
      db('entity_1').max('id as m')
        .then((rows) => {
          if (rows.length === 0) sequences[session.name] = 1
          else sequences[session.name] = rows[0].m + 1
          resolve(sequences[session.name]++)
        })
        .catch(reject)
    }
  })
}

const newInputId = (session, callback) => {
  return new Promise((resolve, reject) => {
    if (inputSequences[session.name]) resolve(inputSequences[session.name]++)
    else {
      // TODO: Select every table
      let db = session.dbs['inputs2017']
      db('input_1_201708').max('id as m')
        .then((rows) => {
          if (rows.length === 0) inputSequences[session.name] = 1
          else inputSequences[session.name] = rows[0].m + 1
          resolve(inputSequences[session.name]++)
        })
        .catch(reject)
    }
  })
}

/* Call for putting settings values */
const postSettings = (session, settings) => {
  return new Promise((resolve, reject) => {
    let db = session.dbs['state']
    var l = []
    for (var property in settings) {
      if (settings.hasOwnProperty(property)) { l.push({setting: property, value: settings[property]}) }
    }
    Promise.all(l.map((x) => putSettingItem(db, x)))
      .then(resolve).catch(reject)
  })
}

/* Call for putting settings values */
const getSettings = (session) => {
  return new Promise((resolve, reject) => {
    let db = session.dbs['state']
    db.select('setting', 'value').from('settings').then((rows) => {
      let ret = {}
      for (var i = 0; i < rows.length; i++) ret[rows[i].setting] = rows[i].value
      resolve(ret)
    })
      .catch(reject)
  })
}

function putSettingItem (db, elem) {
  return new Promise((resolve, reject) => {
    var setting = elem.setting
    var value = elem.value
    db.select('value').from('settings').where('setting', setting)
      .then((rows) => {
        if (rows == null || rows.length === 0) {
          let o = {
            setting: setting,
            value: value
          }
          db.insert(o).into('settings')
            .then(resolve).catch(reject)
        } else {
          db('settings').update({value: value}).where('setting', setting)
            .then(resolve).catch(reject)
        }
      })
      .catch(reject)
  })
}

/*
Blocks entity type, to preserve keys.
 - session: API session
 - type: Entity type
*/
const blockType = (session, type, callback) => {
  if (typesBlocks[type]) callback(new Error(type + ' blocked'))
  else {
    typesBlocks[type] = {session: session, timeout: setTimeout(timeoutBlock, 5000, type)}
    callback()
  }
}

const timeoutBlock = (type) => {
  log.error(`Timeout exceeded blocking ${type} type`)
  delete typesBlocks[type]
}

/*
 Releases entity type.
 - session: API session
 - type: Entity type
 */
const releaseType = (session, type, callback) => {
  let b = typesBlocks[type]
  if (b) {
    clearTimeout(b.timeout)
    delete typesBlocks[type]
  }
  callback()
}

/* Get session object and calls required function. */
const apiCall = (req, res, f) => {
  sessions.manageSession(req, res, (req, res, session) => {
    f(session, req.body)
      .then((result) => res.status(200).jsonp(result))
      .catch((err) => res.status(500).end(err.message))
  })
}

const init = () => {
  if (g.getConfig().api_listen) {
    log = logger.getLogger('state')
    log.debug('>> state init()')
    httpServer.getApi().post('/api/state/settings', (req, res) => apiCall(req, res, postSettings))
    httpServer.getApi().get('/api/state/settings', (req, res) => apiCall(req, res, getSettings))
  }
  return Promise.resolve()
}

module.exports = {
  init,
  postSettings,
  getSettings,
  newId,
  newInputId,
  blockType,
  releaseType
}

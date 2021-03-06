/* global require, process */
// -------------------------------------------------------------------------------------------
// State module.
// -Implements API calls over global settings.
// -Generates id's for primary keys.
// -Blocks types to avoid concurrent actions over keys.
// -------------------------------------------------------------------------------------------

const logger = require('../utils/log')
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

const newInputId = (session) => {
  return new Promise((resolve, reject) => {
    if (inputSequences[session.name]) resolve(inputSequences[session.name]++)
    else {
      initInputsId(session)
        .then(() => resolve(inputSequences[session.name]++))
        .catch(reject)
    }
  })
}

const initInputsId = (session) => {
  return new Promise((resolve, reject) => {
    let l = []
    for (let p in session.dbs) {
      if (session.dbs.hasOwnProperty(p) && p.startsWith('inputs')) {
        l.push(session.dbs[p])
      }
    }
    let max = 0
    Promise.all(l.map((db) => {
      return new Promise((resolve, reject) => {
        let months = []
        for (let m in db.client.config.months) {
          if (db.client.config.months.hasOwnProperty(m)) months.push(m)
        }
        Promise.all(months.map((m) => {
          return new Promise((resolve, reject) => {
            db('input_1_' + m).max('id as m')
              .then((rows) => {
                if (rows.length > 0) {
                  let ma = rows[0].m
                  if (typeof ma === 'string') ma = parseInt(ma)
                  if (ma > max) max = rows[0].m
                }
                resolve()
              })
              .catch(reject)
          })
        }))
          .then(resolve).catch(reject)
      })
    }))
      .then(() => {
        inputSequences[session.name] = max + 1
        log.info(`Last input id on ${session.name}: ${inputSequences[session.name]}`)
        resolve()
      })
      .catch(reject)
  })
}

/* Call for putting settings values */
const postSettings = (session, settings) => {
  return new Promise((resolve, reject) => {
    let db = session.dbs['state']
    let l = []
    for (let property in settings) {
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
      for (let i = 0; i < rows.length; i++) ret[rows[i].setting] = rows[i].value
      resolve(ret)
    })
      .catch(reject)
  })
}

function putSettingItem (db, elem) {
  return new Promise((resolve, reject) => {
    let setting = elem.setting
    let value = elem.value
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
const blockType = (session, type) => {
  return new Promise((resolve, reject) => {
    if (typesBlocks[type]) reject(new Error(type + ' blocked'))
    else {
      typesBlocks[type] = {session: session, timeout: setTimeout(timeoutBlock, 5000, type)}
      resolve()
    }
  })
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
const releaseType = (session, type) => {
  return new Promise((resolve, reject) => {
    let b = typesBlocks[type]
    if (b) {
      clearTimeout(b.timeout)
      delete typesBlocks[type]
    }
    resolve()
  })
}

const init = () => {
  return new Promise((resolve, reject) => {
    // Init API
    sessions.registerMethod(module.exports, 'postSettings',
      'POST', '/api/state/settings')
    sessions.registerMethod(module.exports, 'getSettings',
      'GET', '/api/state/settings')
    sessions.registerMethod(module.exports, 'newId',
      'GET', '/api/state/newId')
    sessions.registerMethod(module.exports, 'newInputId',
      'GET', '/api/state/newInputId')
    sessions.registerMethod(module.exports, 'blockType',
      'GET', '/api/state/blockType')
    sessions.registerMethod(module.exports, 'releaseType',
      'GET', '/api/state/releaseType')

    // Init service
    if (g.isLocalService('state')) {
      log = logger.getLogger('state')
      log.debug('>> state init()')
      // Get inputs id for every customer
      Promise.all(sessions.getCustomersList().map((c) => {
        return initInputsId({name: c.name, dbs: sessions.getDatabases(c.name)})
      }))
      .then(() => g.addLocalService('state'))
      .then(resolve)
      .catch(reject)
    } else resolve()
  })
}

module.exports = {
  serviceName: 'state',
  init,
  initInputsId,
  postSettings,
  getSettings,
  newId,
  newInputId,
  blockType,
  releaseType
}

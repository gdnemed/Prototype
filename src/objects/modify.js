// -------------------------------------------------------------------------------------------
// Module for structured database updates, inserts and deletes, using objects and a graph model.
// -------------------------------------------------------------------------------------------
const MODEL = require('./model')
const recursive = require('./recursive')
// let log = require('../utils/log').getLogger('db')

let nodeId = 1

/* Generic function for insert or update.
- session: Lemuria session.
- stateService: Link to state service, which gives identifiers and blocks keys.
- variables: URL variables, which complement data.
- squery: Strutured query.
- data: Object passed as the body of API call.
- extraFunction: Extra treatment to be executed after insert/update.
*/
const put = (session, stateService, variables, squery, data, extraFunction) => {
  return new Promise((resolve, reject) => {
    // Diferent functions depending on 'what' we want to put
    if (squery._entity_) {
      let keys = getKeys(squery, variables, data)
      putEntity(session, stateService, variables, squery, keys, data, extraFunction)
        .then(resolve).catch(reject)
    } else if (squery._property_) {
      recursive.putProperty(session, stateService, variables, squery, data, extraFunction)
        .then(resolve).catch(reject)
    } else if (squery._relation_) {
      recursive.putRelation(session, stateService, variables, squery, data, extraFunction)
        .then(resolve).catch(reject)
    } else if (squery._inputs_) {
      putInput(session, stateService, variables, squery, data, extraFunction)
        .then(resolve).catch(reject)
    } else reject(new Error('Type not found'))
  })
}

/* Generic entity update/insert function */
const putEntity = (session, stateService, variables, squery, keys, data, extraFunction) => {
  return new Promise((resolve, reject) => {
    let entity = squery._entity_
    // Create an object for insert/update
    let e
    try {
      e = setObjectToPut(squery, data, variables)
    } catch (err) {
      reject(err)
      return
    }
    let insert = e.id !== null && e.id !== undefined
    // We must block any modification over this type, until we finish
    stateService.blockType(session, entity)
    // Search for entities with same key values
      .then(() => {
        searchEntity(session, keys, squery, data, variables)
          .then(() => getSentenceEntity(session, stateService, squery, e, variables))
          .then((sentence) => sentence) // Execute it
          .then((result) => {
            // Once the entity is inserted, we can release blocking
            stateService.releaseType(session, entity)
              .then(() => subPuts(session, stateService, variables, squery, data, e.id))
              .then(() => {
                // Extra treatment, if needed
                if (extraFunction) {
                  return extraFunction(session, e.id, insert, false)
                } else return Promise.resolve()
              })
              .then(() => resolve(e.id))
              .catch(reject)
          })
          .catch((err) => {
            // If execution went wrong, release blocking and reject
            stateService.releaseType(session, entity)
              .then(() => reject(err)).catch(() => reject(err))
          })
      })
      .catch(reject)
  })
}

const setObjectToPut = (squery, data, variables) => {
  let entity = squery._entity_
  // We pass every data to a new object
  let e = getProperFields(squery, entity, data, variables)
  // Check required fields
  let r = MODEL.ENTITIES[entity].required
  if (r) {
    for (let m = 0; m < r.length; m++) {
      if (!e.hasOwnProperty(r[m]) || e[r[m]] === null || e[r[m]] === undefined) {
        return new Error(`${r[m]} required for ${entity}`)
      }
    }
  }
  return e
}

/* Builds object to put in DB and creates update/insert sentence to execute. */
const getSentenceEntity = (session, stateService, squery, e, variables) => {
  return new Promise((resolve, reject) => {
    let sentence
    let db = session.dbs['objects']
    if (e.id) {
      stateService.newId(session)
        .then((id) => {
          e.id = id
          sentence = db.insert(e).into('entity_1')
          resolve(sentence)
        })
        .catch(reject)
    } else {
      sentence = db('entity_1').where('id', e.id).update(e)
      resolve(sentence)
    }
  })
}

/* Creates an object using squery model, filling it with
 * data in 'data' and 'variables', and converting JSONs if needed. */
const getProperFields = (squery, entity, data, variables) => {
  let d = entity ? {type: entity} : {}
  for (var p in squery) {
    if (squery.hasOwnProperty(p) &&
      p.charAt(0) !== '_' &&
      typeof squery[p] === 'string') {
      let val = data[p]
      if (val === undefined || val === null) val = variables[p]
      if (val !== null && val !== undefined) {
        if (squery[p] === 'intname') d[squery[p]] = JSON.stringify(val)
        else d[squery[p]] = val
      }
    }
  }
  return d
}

/* Returns the list of keys for the entity to update/insert.
Every element of the list has this properties:
- fields: List of fields of entity table, to use
- values: List of values for fields
- dependence: Structure defining a dependence over another entity
- complete: true if key is well defined, and can be used to find object
*/
const getKeys = (squery, variables, data) => {
  let keys = MODEL.ENTITIES[squery._entity_].keysList
  // Keys list
  let list = []
  for (let i = 0; i < keys.length; i++) {
    let k = keys[i]
    let e = {
      fields: [],
      values: [],
      complete: true
    }
    // clone dependence
    if (k.dependence) {
      e.dependence = JSON.parse(JSON.stringify(k.dependence))
      e.value = variables.id
      if (e.value === undefined || e.value === null) e.complete = false
    }
    // Create list for fields, with its values
    for (let j = 0; j < k.fields.length; j++) {
      let f = k.fields[j]
      e.fields.push(f.field)
      e.values.push(data[f.field])
      if (data[f.field] === undefined || data[f.field] === null) e.complete = false
    }
    list.push(e)
  }
  return list
}

/* Search for an entity using keys, and returns it */
const searchEntity = (session, keys, squery, data, variables) => {
  return new Promise((resolve, reject) => {
    let db = session.dbs['objects']
    // Try to find a useful key
    for (let i = 0; i < keys.length; i++) {
      let k = keys[i]
      if (k.complete) {
        // Build sentence
        let s = db('entity_' + nodeId)
          .column('id')
          .where('type', squery._entity_)
        // Add key fields
        for (let j = 0; j < k.fields.length; j++) {
          s.where(k.fields[j], k.values[j])
        }
        // Execute it
        s.then((rows) => {
          if (rows !== null && rows.length > 0) {
            resolve(rows[0].id)
          } else resolve(0)
        })
        .catch(reject)
        return
      }
    }
    reject(new Error('No key found'))
  })
}

/*
Searches for properties and entities related with entity id, to be put
params is an object with these properties:
 session, id, str, entity, period, data, variables, callback
*/
const subPuts = (session, stateService, variables, squery, data, id) => {
  return new Promise((resolve, reject) => {
    // We create a temporal list for sequential execution
    let l = []
    for (var p in squery) {
      if (squery.hasOwnProperty(p) &&
        (p === '_subput_' || data.hasOwnProperty(p)) &&
        (squery[p]._property_ || squery[p]._relation_)) l.push(p)
    }
    subput(session, stateService, variables, squery, data, id, l, 0)
      .then(resolve).catch(reject)
  })
}

/*
Iterates over the list of properties and entities to put, and calls proper function.
*/
const subput = (item, session, stateService,
variables, squery, data, id, l, n) => {
  return new Promise((resolve, reject) => {
    if (n >= l.length) resolve()
    else {
      // Call recursively put, adding id and entity type
      variables._parent_ = id
      variables._parent_entity_ = squery._entity_
      put(session, stateService, variables, squery[l[n]], data, null)
        .then(() => subput(item, session, stateService,
          variables, squery, data, id, l, n + 1))
        .then(resolve)
        .catch(reject)
    }
  })
}

/* Inserts a new input. */
const putInput = (session, stateService, variables, squery, data, extraFunction) => {
  return new Promise((resolve, reject) => {
    stateService.newInputId(session)
      .then((id) => {
        let period = Math.floor(data.tmp / 100000000)
        // We pass every data to a new object d
        let d = getProperFields(squery, null, data, variables)
        // Check required fields
        let r = MODEL.INPUTS.required
        if (r) {
          for (let m = 0; m < r.length; m++) {
            if (!d.hasOwnProperty(r[m])) {
              reject(new Error(`${r[m]} required for input`))
              return
            }
          }
        }
        let db = session.dbs['inputs' + Math.trunc(period / 100)]
        let table = `input_${nodeId}_${period}`
        // And we add id to insert
        d.id = id
        db.insert(d).into(table)
          .then((rowid) => {
            // Now, every property or relation
            subPuts(session, stateService, variables, squery, data, d.id)
              .then(resolve)
              .catch((err) => reject(new Error(`Input inserted with id ${id}, but errors found: ${err}`)))
          })
          .catch(reject)
      })
      .catch(reject)
  })
}

/*
Generic delete function
- session: Session of the user.
- id: Internal id of the entity or input
- entity: true it it's an entity. False if input.
- period: It inputs, period (year-month) where input is.
- extraFunction: Optional function to be executed after deletion.
 */
const del = (session, id, entity, period, extraFunction) => {
  return new Promise((resolve, reject) => {
    if (!id) {
      reject(new Error('No id defined'))
      return
    }
    if (typeof id === 'string') id = parseInt(id)
    let db = session.dbs['objects']
    if (entity) {
      db('property_num_' + nodeId).where('entity', id).delete()
        .then(() => db('property_str_' + nodeId).where('entity', id).delete())
        .then(() => db('property_bin_' + nodeId).where('entity', id).delete())
        .then(() => db('relation_' + nodeId).where('id1', id).orWhere('id2', id).delete())
        .then(() => db('entity_' + nodeId).where('id', id).delete())
        .then((count) => {
          if (extraFunction) extraFunction(session, id, false, true, () => resolve())
          else resolve(count)
        })
        .catch(reject)
    } else { // If no entity, it's an input
      let db = session.dbs['inputs' + period]
      db(`input_data_num_${nodeId}_${period}`).where('entity', id).delete()
        .then(() => db(`input_data_str_${nodeId}_${period}`).where('entity', id).delete())
        .then(() => db(`input_data_bin_${nodeId}_${period}`).where('entity', id).delete())
        .then(() => db(`input_rel_${nodeId}_${period}`).where('id1', id).orWhere('id2', id).delete())
        .then(() => db(`input_${nodeId}_${period}`).where('id', id).delete())
        .then(resolve)
        .catch(reject)
    }
  })
}

module.exports = {
  del,
  put
}

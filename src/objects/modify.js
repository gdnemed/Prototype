// -------------------------------------------------------------------------------------------
// Module for structured database updates, inserts and deletes, using objects and a graph model.
// -------------------------------------------------------------------------------------------
const MODEL = require('./model')
const recursive = require('./recursive')
const g = require('../global')
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
  let f
  // Different functions depending on 'what' we want to put
  if (squery._entity_) {
    f = putEntity
  } else if (squery._property_) {
    f = recursive.putProperty
  } else if (squery._relation_) {
    f = recursive.putRelation
  } else if (squery._inputs_) {
    f = putInput
  }
  if (f) return preparePut(session, stateService, variables, squery, data, extraFunction, f)
  else return Promise.reject(new Error('Type not found'))
}

/* Prepares a filter over entities, and then executes a put over property/relation */
const preparePut = (session, stateService, variables, squery, data, extraFunction, putFunction) => {
  return new Promise((resolve, reject) => {
    if (squery._filter_) {
      execFilter(session, squery._filter_, variables)
        .then((rows) => {
          putSingle(session, stateService, variables, squery,
            data, extraFunction, putFunction, rows, 0)
            .then(resolve).catch(reject)
        })
        .catch(reject)
    } else {
      // If no filter, data is in variables._parent_, so just call function
      putFunction(session, stateService, variables, squery, data, extraFunction)
        .then(resolve).catch(reject)
    }
  })
}

/* Creates a query over db, using a filter */
const execFilter = (session, filter, variables) => {
  let table, db
  if (filter.entity) {
    db = session.dbs['objects']
    table = db.from('entity_' + nodeId).where('type', filter.entity)
  } else {
    db = session.dbs['inputs' + filter.period.substr(0, 4)]
    table = db.from(`input_${nodeId}_${filter.period}`)
  }
  if (filter.field) {
    let val = variables[filter.variable]
    table.where(filter.field, val)
  }
  return table
}

/* Executes put of property/relation over a previously filtered object */
const putSingle = (session, stateService, variables,
squery, data, extraFunction, putFunction, rows, n) => {
  return new Promise((resolve, reject) => {
    if (n >= rows.length) resolve()
    else {
      variables._parent_ = {
        id: rows[n].id,
        entity: squery._filter_.entity,
        period: squery._filter_.inputs,
        put: put
      }
      putFunction(session, stateService, variables, squery, data, extraFunction)
        .then(() => putSingle(session, stateService, variables,
          squery, data, extraFunction, putFunction, rows, n + 1))
        .then(resolve)
        .catch(reject)
    }
  })
}

/* Generic entity update/insert function */
const putEntity = (session, stateService, variables, squery, data, extraFunction) => {
  let keys = getKeys(squery, variables, data)
  if (keys) {
    return new Promise((resolve, reject) => {
      let entity = squery._entity_
      let insert, e
      // We must block any modification over this type, until we finish
      g.invokeService('state', 'blockType', session, entity)
      // Search for entities with same key values
        .then(() => {
          searchEntity(session, keys, squery, data, variables)
            .then((id) => {
              insert = id !== null && id !== undefined
              // Create an object for insert/update
              e = getProperFields(squery, entity, data, variables)
              return getSentenceEntity(session, stateService, squery, e, id, variables)
            })
            .then((sentence) => { return sentence }) // Execute it
            .then((result) => {
              // Once the entity is inserted, we can release blocking
              g.invokeService('state', 'releaseType', session, entity)
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
              g.invokeService('state', 'releaseType', session, entity)
                .then(() => reject(err)).catch(() => reject(err))
            })
        })
        .catch(reject)
    })
  } else return Promise.reject(new Error('No keys available'))
}

/* Builds object to put in DB and creates update/insert sentence to execute. */
const getSentenceEntity = (session, stateService, squery, e, id, variables) => {
  return new Promise((resolve, reject) => {
    let sentence
    let db = session.dbs['objects']
    let r = MODEL.ENTITIES[squery._entity_].required
    if (id) {
      // Check required fields
      if (r) {
        for (let m = 0; m < r.length; m++) {
          if (e.hasOwnProperty(r[m]) && (e[r[m]] === null || e[r[m]] === undefined)) {
            reject(new Error(`${r[m]} required for ${squery._entity_}`))
            return
          }
        }
      } else {
        reject(new Error(`No definition for ${squery._entity_}`))
        return
      }
      e.id = id
      sentence = db('entity_1').where('id', id).update(e)
      resolve(sentence)
    } else {
      // Check required fields
      if (r) {
        for (let m = 0; m < r.length; m++) {
          if (!e.hasOwnProperty(r[m]) || e[r[m]] === null || e[r[m]] === undefined) {
            reject(new Error(`${r[m]} required for ${squery._entity_}`))
            return
          }
        }
      } else {
        reject(new Error(`No definition for ${squery._entity_}`))
        return
      }

      g.invokeService('state', 'newId', session)
        .then((id) => {
          e.id = id
          sentence = db.insert(e).into('entity_1')
          resolve(sentence)
        })
        .catch(reject)
    }
  })
}

/* Creates an object using squery model, filling it with
 * data in 'data' and 'variables', and converting JSONs if needed. */
const getProperFields = (squery, entity, data, variables) => {
  let d = entity ? {type: entity} : {}
  for (let p in squery) {
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
      let entry = findEntry(squery, f.field)
      if (entry === null || entry === undefined) e.values.push(null)
      else {
        e.values.push(data[entry])
        if (data[entry] === undefined || data[entry] === null) e.complete = false
      }
    }
    list.push(e)
  }
  return list
}

/* Finds an entry within a structure, which data is f */
const findEntry = (squery, f) => {
  for (let p in squery) {
    if (squery.hasOwnProperty(p)) {
      if (squery[p] === f) return p
    }
  }
}

/* Search for an entity using keys, and returns it */
const searchEntity = (session, keys, squery, data, variables) => {
  if (variables._parent_) return Promise.resolve(variables._parent_.id)
  else {
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
    for (let p in squery) {
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
const subput = (session, stateService,
variables, squery, data, id, l, n) => {
  return new Promise((resolve, reject) => {
    if (n >= l.length) resolve()
    else {
      let entry = l[n]
      // Call recursively put, adding id and entity/period
      variables._parent_ = {id: id, entity: squery._entity_, period: variables._period_, put: put}
      put(session, stateService, variables, squery[entry], data[entry], null)
        .then(() => subput(session, stateService,
          variables, squery, data, id, l, n + 1))
        .then(resolve)
        .catch(reject)
    }
  })
}

/* Inserts a new input. */
const putInput = (session, stateService, variables, squery, data, extraFunction) => {
  return new Promise((resolve, reject) => {
    // stateService.newInputId(session)
    g.invokeService('state', 'newInputId', session)
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
            variables._period_ = period
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

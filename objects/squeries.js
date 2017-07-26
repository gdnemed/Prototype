// -------------------------------------------------------------------------------------------
// Module for structured queries, using objects and a graph model.
// -------------------------------------------------------------------------------------------

const MODEL = require('./model')
const CT = require('../CT')
const utils = require('../utils/utils')
const logger = require('../utils/log').getLogger('db')

let nodeId = 1

/*
Main visible function for getting data.
-session: API session
-variables: Variables used by the query
-str: Structure for query
-callback: Callback function
*/
const get = (session, variables, str, callback) => {
  if (!str._guide_) {
    if (!prepareGet(session, str)) {
      callback(new Error('Syntax error'))
      return
    }
  }
  // It's always useful to have now and today values
  if (!variables.now) variables.now = session.now
  if (!variables.today) variables.today = session.today
  // Do work
  executeSelect(str, variables, session, callback)
}

/*
 Main visible function for putting data.
 -session: API session.
 -db: Database
 -variables: Variables used by the query
 -str: Structure for put process
 -data: Data to insert
 -callback: Callback function
 */
const put = (session, stateService, variables, str, data, extraFunction, callback) => {
  let e = str._entity_
  if (e) {
    let params = {
      session: session,
      str: str,
      entity: e,
      data: data,
      variables: variables,
      stateService: stateService,
      extraFunction: extraFunction,
      callback: callback
    }
    // Create keys structure, which maps fields to values
    let keysData = []
    let kDef = MODEL.ENTITIES[e].keys
    for (let i = 0; i < kDef.length; i++) {
      keysData.push({fields: kDef[i], values: []})
    }
    if (keysData) {
      searchFromKey(session, e, keysData, getUserKey(str, data), stateService, str, data)
        .then((id) => {
          if (id) {
            params.id = id
            executeUpdate(params)
              .then((idPut) => callback(null, idPut))
              .catch(callback)
          } else {
            // On insert, we need to block key data to prevent parallel inserts over same key
            stateService.newId(session)
              .then((id) => {
                params.id = id
                executeInsert(params)
                  .then((idPut) => callback(null, idPut))
                  .catch(callback)
              })
              .catch((err) => release(session, e, stateService, callback, err))
          }
        })
        .catch((err) => release(session, e, stateService, callback, err))
    } else callback(new Error('Key not found'))
  } else if (str._inputs_) {
    // Inputs insert/update.
    // For the moment, only insert
    // On insert, we need to block key data to prevent parallel inserts over same key
    stateService.newInputId(session, (err, id) => {
      if (err) callback(err)
      else {
        let params = {
          session: session,
          id: id,
          str: str,
          period: Math.floor(data.tmp / 100000000),
          data: data,
          variables: variables,
          callback: callback
        }
        executeInsertInput(params)
      }
    })
  } else callback(new Error('Type not found'))
}

/*
Generic delete function
 */
const del = (session, variables, str, data, extraFunction, callback) => {
  let id = variables.id
  if (!id) {
    callback(new Error('No id defined'))
    return
  }
  if (typeof id === 'string') id = parseInt(id)
  let e = str._entity_
  if (e) {
    let db = session.dbs['objects']
    db('property_num_' + nodeId).where('entity', id).delete()
      .then(() => db('property_str_' + nodeId).where('entity', id).delete())
      .then(() => db('property_bin_' + nodeId).where('entity', id).delete())
      .then(() => db('relation_' + nodeId).where('id1', id).orWhere('id2', id).delete())
      .then(() => db('entity_' + nodeId).where('id', id).delete())
      .then((count) => {
        if (extraFunction) extraFunction(session, id, false, true, callback)
        else callback(null, count)
      })
      .catch((err) => callback(err))
  } else if (str._input_) {
    let db = session.dbs['inputs']
    let period = variables.period
    db(`input_data_num_${nodeId}_${period}`).where('entity', id).delete()
      .then(() => db(`input_data_str_${nodeId}_${period}`).where('entity', id).delete())
      .then(() => db(`input_data_bin_${nodeId}_${period}`).where('entity', id).delete())
      .then(() => db(`input_rel_${nodeId}_${period}`).where('id1', id).orWhere('id2', id).delete())
      .then(() => db(`input_${nodeId}_${period}`).where('id', id).delete())
      .then((count) => callback(count))
      .catch((err) => callback(err))
  }
}

/*
Gets the key fields provided by user to search before put
 */
const getUserKey = (str, data) => {
  let uk
  for (let p in str) {
    if (str[p] && typeof str[p] === 'string' && str[p].startsWith('search:')) {
      if (!uk) uk = {fields: [], values: []}
      uk.fields.push(str[p].substring(7))
      uk.values.push(data[p])
    }
  }
  return uk
}

const release = (session, e, stateService) => {
  return new Promise((resolve, reject) => {
    stateService.releaseType(session, e, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/*
Searches a list of keys for this entity type.
- entity: Entity type.
- keysData: List of keys which must be satisfied for this entity type.
- userKey: Concrete key the user want to use to search (useful when the fields of the key must change).
- stateService: Service which blocks keys and gives id's
- str: Structured put
- data: Data to insert/update
Once done, calls callback function passing:
- err: Error, if any
- id: Id of the entity found for the userKey of for the first key if userKey not specified
- conflict: List of other id's which have values
for some of the keys which would be repeated if data is inserted.
*/
const searchFromKey = (session, entity, keysData, userKey, stateService, str, data) => {
  return new Promise((resolve, reject) => {
    let finalKey
    if (userKey == null) {
      // No key specified, we search the first with data
      for (let i = 0; i < keysData.length; i++) {
        let key = keysData[i].fields
        let ok = true
        let values = []
        for (let j = 0; j < key.length; j++) {
          let found = false
          for (var p in str) {
            if (str.hasOwnProperty(p)) {
              if (str[p] === key[j] && data.hasOwnProperty(p)) {
                values.push(data[p])
                found = true
                break
              }
            }
          }
          if (!found) {
            ok = false
            break
          }
        }
        if (ok) {
          finalKey = {fields: key, values: values}
          break
        }
      }
    } else {
      finalKey = {fields: [], values: []}
      for (let i = 0; i < userKey.fields.length; i++) {
        finalKey.fields.push(str[userKey.fields[i]])
        finalKey.values.push(userKey.values[i])
      }
    }
    if (!finalKey || finalKey == null) {
      reject(new Error('No key values found'))
      return
    }
    // Deny inserts or updates over this entity keys
    stateService.blockType(session, entity, (err) => {
      if (err) reject(err)
      else {
        // Now whe have the key. Do select
        let db = session.dbs['objects']
        let sentence = db.select('id').from('entity_' + nodeId)
        for (let i = 0; i < finalKey.fields.length; i++) {
          sentence.where(finalKey.fields[i], finalKey.values[i])
        }
        sentence.then((rows) => {
          if (rows.length === 0) resolve(null, null) // Insert
          else if (rows.length > 1) reject(new Error('Ambiguous key: more than one entity found'))
          else {
            resolve(rows[0].id)// Update
            // Entity found. Now we must ensure every key is respected
            /* loadKeyEntities(db, keysData, 0, {}, (err, ids) => {
              if (err) callback(err)
              else {
                if (ids && ids.length > 0) {
                  if (ids.length > 1) callback(new Error('Key violated'))
                  else callback(null, ids[0])// Update
                } else callback(null, null) // Insert
              }
            }) */
          }
        })
          .catch(reject)
      }
    })
  })
}

/*
Loads entities from a key, and puts them in a map.
- keysData: List of keys
- i: Index of current key
- result: Map id -> data where objects will be put
*/
/* const loadKeyEntities = (db, keyData, result) => {
  return new Promise((resolve, reject) => {
    db.select().from('entity_' + nodeId).where()
      .then((rows) => {
        for (let j = 0; j < rows.length; j++) {
          let id = 'id' + rows.id
          if (!result[id]) result[id] = rows[j]
          else {
          }
        }
        resolve()
      })
      .catch((err) => reject(err))
  })
} */

const executeInsert = (params) => {
  return new Promise((resolve, reject) => {
    if (params.entity) {
      // We pass every data to a new object d
      let d = getProperFields(params.str, params.entity, params.data)
      // Check required fields
      let r = MODEL.ENTITIES[params.entity].required
      if (r) {
        for (let m = 0; m < r.length; m++) {
          if (!d.hasOwnProperty(r[m])) {
            reject(new Error(`${r[m]} required for ${params.entity}`))
            return
          }
        }
      }
      let db = params.session.dbs['objects']
      // And we add id to insert
      d.id = params.id
      db.insert(d).into('entity_1')
        .then((rowid) => {
          release(params.session, params.entity, params.stateService)
            .then(() => {
              subPuts(params)
                .then(() => {
                  if (params.extraFunction) {
                    params.extraFunction(params.session, params.id, true, false, () => resolve(params.id))
                  } else resolve(params.id)
                })
                .catch((err) => {
                  reject((new Error(`${d.id} ${params.entity} inserted, but errors found: ${err}`)))
                })
            })
            .catch(reject)
        })
        .catch(reject)
    } else reject(new Error('No entity'))
  })
}

/*
 params is an object with these properties:
 session, id, str, entity, period, data, variables, callback
 */
const executeUpdate = (params) => {
  return new Promise((resolve, reject) => {
    if (params.entity) {
      let d = getProperFields(params.str, params.entity, params.data)
      // Check required fields
      let r = MODEL.ENTITIES[params.entity].required
      if (r) {
        for (let m = 0; m < r.length; m++) {
          if (d.hasOwnProperty(r[m]) && d[r[m]] == null) {
            reject(new Error(`${r[m]} required for ${params.entity}`))
            return
          }
        }
      }
      let db = params.session.dbs['objects']
      db('entity_1').where('id', params.id).update(d)
        .then((count) => {
          release(params.session, params.entity, params.stateService)
            .then(() => {
              subPuts(params)
                .then(() => {
                  if (params.extraFunction) params.extraFunction(params.session, params.id, false, false, () => resolve())
                  else resolve(params.id)
                })
                .catch((err) => {
                  reject((new Error(`${count} ${params.entity} updated, but errors found: ${err}`)))
                })
            })
        })
        .catch(reject)
    }
  })
}

/*
 params is an object with these properties:
 session, id, str, entity, period, data, variables, callback
 */
const executeInsertInput = (params) => {
  // We pass every data to a new object d
  let d = getProperFields(params.str, null, params.data)
  // Check required fields
  let r = MODEL.INPUTS.required
  if (r) {
    for (let m = 0; m < r.length; m++) {
      if (!d.hasOwnProperty(r[m])) {
        params.callback(new Error(`${r[m]} required for input`))
        return
      }
    }
  }
  let db = params.session.dbs['inputs']
  let table = `input_${nodeId}_${params.period}`
  // And we add id to insert
  d.id = params.id
  db.insert(d).into(table).then((rowid) => {
    let f = params.callback
    params.callback = (err) => {
      if (err) f(new Error(`Input inserted with id ${params.id}, but errors found: ${err}`))
      else f(null, params.id)
    }
    subPuts(params).then(params.callback)
  })
  .catch(params.callback)
}

/*
Searches for properties and entities related with entity id, to be put
params is an object with these properties:
 session, id, str, entity, period, data, variables, callback
*/
const subPuts = (params) => {
  return new Promise((resolve, reject) => {
    let l = []
    for (var p in params.str) {
      if (params.str.hasOwnProperty(p) &&
        params.data.hasOwnProperty(p) &&
        (params.str[p]._property_ || params.str[p]._relation_)) l.push(p)
    }
    Promise.all(l.map((x) => subput(x, params)))
      .then(resolve).catch(reject)
  })
}

/*
Iterates over the list of properties and entities to put, and calls proper function.
*/
const subput = (item, params) => {
  return new Promise((resolve, reject) => {
    if (params.str[item]._property_) {
      putProperty(params.str[item]._property_, item, params, resolve, reject)
        .then(resolve).catch(reject)
    } else if (params.str[item]._relation_) {
      putRelation(params.str[item]._relation_, item, params, resolve, reject)
        .then(resolve).catch(reject)
    }
  })
}

/*
Inserts or updates a property for an entity
- i: Index in the property list.
- f: Callback function
 */
const putProperty = (property, entry, params) => {
  return new Promise((resolve, reject) => {
    let isArray = false
    if (property.charAt(0) === '[') {
      isArray = true
      property = property.substring(1, property.length - 1)
    }
    let modelProperty = MODEL.PROPERTIES[property]
    if (!modelProperty) {
      reject(new Error(`${property} property does not exist`))
      return
    }
    let propObj = params.str[entry]
    let propDataList = isArray ? params.data[entry] : [params.data[entry]]
    if (propObj._total_) prepareTotalHistoric(propDataList, modelProperty.time)
    Promise.all(propDataList.map((x) => putElemProperty(property, modelProperty, propObj, x, params)))
      .then(resolve)
      .catch(reject)
  })
}

const putElemProperty = (property, modelProperty, propObj, elem, params) => {
  return new Promise((resolve, reject) => {
    let r = {property: property}
    for (let p in propObj) {
      if (propObj.hasOwnProperty(p)) {
        if (propObj[p] === 't1') {
          if (propObj[p]) r.t1 = typeof elem[p] === 'string' ? parseInt(elem[p]) : elem[p]
        } else if (propObj[p] === 't2') {
          if (propObj[p]) r.t2 = typeof elem[p] === 'string' ? parseInt(elem[p]) : elem[p]
        } else if (propObj[p] === 'value') r.value = elem[p]
      }
    }
    if (typeof elem === 'string' || typeof elem === 'number') r.value = elem
    // For entities (not inputs), time counts
    if (params.entity) {
      r.entity = params.id
      if (!r.t1) r.t1 = modelProperty.time ? CT.START_OF_TIME : CT.START_OF_DAYS
      if (!r.t2) r.t2 = modelProperty.time ? CT.END_OF_TIME : CT.END_OF_DAYS
    } else {
      // Input
      r.id = params.id
    }

    let db = params.session.dbs[params.entity ? 'objects' : 'inputs']
    let table = params.entity ? `property_${modelProperty.type}_${nodeId}`
      : `input_data_${modelProperty.type}_${nodeId}_${params.period}`
    let s = db.from(table)
      .where(params.entity ? 'entity' : 'id', params.id).where('property', property)
    s.then((rows) => {
      if (params.entity) {
        historicModifier(rows, r, table, db, (err) => {
          if (err) reject(err)
          else resolve()
        })
      } else {
        // Inputs properties
        if (rows.length === 0) {
          db(table).insert(r)
            .then(resolve)
            .catch(reject)
        } else {
          db(table).where('id', params.id).where('property', property)
            .update(r)
            .then(resolve)
            .catch(reject)
        }
      }
    })
      .catch(reject)
  })
}

/*
 Order list and insert nulls, for total imports.
*/
const prepareTotalHistoric = (l, withtime) => {
  l.sort((a, b) => {
    if (a.t1) {
      if (b.t1) return a.t1 - b.t1
      else return 1
    } else return -1
  })
  let current = withtime ? CT.START_OF_TIME : CT.START_OF_DAYS
  let limit = l.length
  for (let j = 0; j < limit; j++) {
    if (l[j].t1) {
      if (l[j].t1 > current) {
        l.splice(j, 0, {blank: true, t1: current, t2: utils.previousDay(l[j].t1)})
        limit++
        j++
      }
    }
    if (l[j].t2) {
      if (l[j].t2 < (withtime ? CT.END_OF_TIME : CT.END_OF_DAYS)) current = utils.nextDay(l[j].t2)
    } else current = withtime ? CT.END_OF_TIME : CT.END_OF_DAYS
  }
  if (current !== (withtime ? CT.END_OF_TIME : CT.END_OF_DAYS)) {
    l.push({blank: true, t1: current, t2: (withtime ? CT.END_OF_TIME : CT.END_OF_DAYS)})
  }
}

/*
 Inserts or updates a relation for an entity
 - i: Index in the property list.
 - f: Callback function
 */
const putRelation = (relationDef, entry, params) => {
  return new Promise((resolve, reject) => {
    let isArray = false
    if (relationDef.charAt(0) === '[') {
      isArray = true
      relationDef = relationDef.substring(1, relationDef.length - 1)
    }
    let arrow = relationDef.indexOf('->')
    let forward
    if (arrow >= 0) forward = true
    else {
      arrow = relationDef.indexOf('<-')
      if (arrow >= 0) forward = false
      else {
        reject(new Error(`Relation syntax error: ${relationDef}`))
        return
      }
    }
    let relation, entity
    relation = relationDef.substring(0, arrow)
    entity = relationDef.substring(arrow + 2)
    let modelRelation = MODEL.RELATIONS[relation]
    if (!modelRelation) {
      reject(new Error(`${relation} relation does not exist`))
      return
    }
    let newStr = {_entity_: entity}
    let relObj = params.str[entry]
    let relDataList = isArray ? params.data[entry] : [params.data[entry]]
    if (relObj._total_) prepareTotalHistoric(relDataList, modelRelation.time)
    putRelationItem(relDataList, 0, newStr, relObj, relation, modelRelation, forward, params)
      .then(resolve).catch(reject)
  })
}

const putRelationItem = (relDataList, i, newStr, relObj, relation, modelRelation, forward, params) => {
  return new Promise((resolve, reject) => {
    if (i >= relDataList.length) resolve()
    else {
      putElemRelation(newStr, relObj, relation, modelRelation, relDataList[i], forward, params)
        .then(() => putRelationItem(relDataList, i + 1, newStr, relObj, relation, modelRelation, forward, params))
        .then(() => resolve())
        .catch((err) => reject(err))
    }
  })
}

/*
Treats every single element related with the main entity to put
*/
const putElemRelation = (newStr, relObj, relation, modelRelation, relData, forward, params) => {
  return new Promise((resolve, reject) => {
    let t1, t2
    for (let p in relObj) {
      if (relObj.hasOwnProperty(p)) {
        switch (p) {
          case '_relation_':
            break
          default:
            if (relObj[p] === 't1') {
              if (relData[p]) t1 = typeof relData[p] === 'string' ? parseInt(relData[p]) : relData[p]
            } else if (relObj[p] === 't2') {
              if (relData[p]) t2 = typeof relData[p] === 'string' ? parseInt(relData[p]) : relData[p]
            } else newStr[p] = relObj[p]
        }
      }
    }
    // For entities (not inputs), time counts
    if (params.entity) {
      if (!t1) t1 = modelRelation.time ? CT.START_OF_TIME : CT.START_OF_DAYS
      if (!t2) t2 = modelRelation.time ? CT.END_OF_TIME : CT.END_OF_DAYS
    }
    // Recursively call put
    put(params.session, params.stateService,
      params.variables, newStr, relData, params.extraFunction,
      (err, id) => {
        if (err) params.callback(err)
        else {
          let table
          let db = params.session.dbs['objects']
          let r
          if (params.entity) { // Entities
            table = 'relation_1'
            r = {
              relation: relation,
              id1: forward ? params.id : id,
              id2: forward ? id : params.id,
              t1: t1,
              t2: t2,
              ord: 0,
              node: 1
            }
          } else { // Inputs
            table = 'input_rel_1_' + params.period
            r = {
              relation: relation,
              id: params.id,
              entity: id
            }
          }
          // Entity is there, now we can create the relation properly
          let s = db.from(table)
            .where('relation', relation)
          if (params.entity) s.where(forward ? 'id1' : 'id2', params.id) // entity
          else s.where('id', params.id) // input
          s.then((rows) => {
            if (params.entity) {
              historicModifier(rows, r, table, db, (err) => {
                if (err) reject(err)
                else resolve()
              })
            } else {
              // TODO: Inputs relations
            }
          })
            .catch((err) => reject(err))
        }
      })
  })
}

const getProperFields = (str, entity, data) => {
  let d = entity ? {type: entity} : {}
  for (var p in str) {
    if (str.hasOwnProperty(p) &&
      p.charAt(0) !== '_' &&
      typeof str[p] === 'string' && data[p] !== undefined &&
      data[p] !== null) {
      if (str[p] === 'intname') d[str[p]] = JSON.stringify(data[p])
      else d[str[p]] = data[p]
    }
  }
  return d
}
/*
Prepare str structure for future execution, adding _guide_ field, which will contain:
- entity_fields: Field of the entity/inputs table.
- isArray: true if the result mus be an array.
- fields_to_remove: by default, _id_, but could also contain fields like dates to clean.
- property_fields: List of simple properties related with entity. Each element has the form:
  {entry: <entry name>, type: <property name>, typeProperty: <num, str or bin>, isArray:{false}}
- property_subqueries: Map of the 3 types of property subqueries: num, str and bin.
  Each entry, if exists, contains a map: property_type->property_element.
  For instance:
   property_subqueries.str={ttgroup:{entry: 'time type group', type: 'ttgroup',
                                    isArray:true, typeProperty: 'str'},
                            _statement_: <Object>}
  The map contains also an _statement_, which is the query to be executed.
- direct_relations: list of relations which don't load the complete history,
  but just the current object related. These can be resolved in a join.
- relations_forward, relations_backward: Maps for relations (for inputs, only forward).
  Each map has relation type as key, and as value, an object like:
  {entry: <entry name>, type: <relation name>, isArray:{false}}
  Each map contains, additionaly, the _statement_ property, with the
  statement to be executed.
- relation_owner: Only for inputs which must be linked with owner entity
*/
const prepareGet = (session, str) => {
  let db = session.dbs[str._inputs_ ? 'inputs' : 'objects']
  str._guide_ = {
    entity_fields: {},
    property_fields: [],
    property_subqueries: {},
    direct_relations: [],
    variablesMapping: [],
    fields_to_parse: []
  }
  let type = getType(str)
  // Get information if this is a subquery from a relation
  if (str._prefix_) {
    str._guide_.prefix = str._prefix_
    str._guide_.subquery = str._subquery_
    str._guide_.link_field_1 = str._link_field_1_
    str._guide_.link_field_2 = str._link_field_2_
  }
  // Always a hidden id of the entity
  str._guide_.fields_to_remove = [(str._prefix_ ? str._prefix_ : '') + '_id_']
  getFields(str, session, str._inputs_)
  if (str._entity_ || str._linked_) {
    let f = str._guide_.entity_fields

    // Select over ENTITY
    if (!str._guide_.subquery) str._guide_.variablesMapping.push(null) // 1 position in bindings is fixed
    if (str._filter_) { // 1 more binding for every variable in filter
      if (str._filter_.variable) str._guide_.variablesMapping.push(str._filter_.variable)
    }
    let e = sq => {
      selectEntity(sq, f, type, str._filter_, str._guide_)
    }
    joins(db, str, e, f, type)
    preparePropertySubquery(db, str._guide_.property_subqueries, 'str')
    preparePropertySubquery(db, str._guide_.property_subqueries, 'num')
    preparePropertySubquery(db, str._guide_.property_subqueries, 'bin')
    prepareRelation(db, str._guide_.relations_forward, true)
    prepareRelation(db, str._guide_.relations_backward, false)
  } else if (str._inputs_) {
    let f = str._guide_.entity_fields
    // Select over INPUTS
    let e = sq => {
      selectInput(sq, f, type, str._filter_, str._guide_)
    }
    joins(db, str, e, f, type)
    preparePropertySubqueryInput(db, str._guide_.property_subqueries, 'str', type)
    preparePropertySubqueryInput(db, str._guide_.property_subqueries, 'num', type)
    preparePropertySubqueryInput(db, str._guide_.property_subqueries, 'bin', type)
    prepareRelationInput(db, str._guide_.relations_forward, type)
  }
  return true
}

/*
Checks which type of relation/entity/property/input is, and if it must be an array.
*/
const getType = (str) => {
  let type = str._entity_ ? str._entity_
    : (str._property_ ? str._property_
    : (str._relation_ ? str._relation_ : str._inputs_))

  if (type) {
    if (type.charAt(0) === '[') {
      str._guide_.isArray = true
      type = type.substring(1, type.length - 1)
    } else str._guide_.isArray = false
  }
  return type
}

/*
Basic select over entity table
*/
const selectEntity = (sq, f, type, filter, helper) => {
  let s = sq.from('entity_' + nodeId)
  s.column('id as ' + (helper.prefix ? helper.prefix : '') + '_id_')
  for (var c in f) {
    if (f.hasOwnProperty(c)) s.column(c + ' as ' + (helper.prefix ? helper.prefix : '') + f[c])
  }
  if (type) s.where('type', type)
  else if (!helper.subquery) s.where('id', 0)
  if (filter) addFilter(s, filter, helper)
  s.as(helper.subquery ? helper.prefix + 'r' : 'e')
  return s
}

/*
 Basic select over inputs table
 */
const selectInput = (sq, f, period, filter, helper) => {
  let s = sq.from('input_' + nodeId + '_' + period)
  s.column('id as _id_')
  for (var c in f) {
    if (f.hasOwnProperty(c)) s.column(c + ' as ' + f[c])
  }
  if (filter) addFilter(s, filter, helper)
  helper.variablesMapping.push(null) // 1 position in bindings is fixed
  return s.as('e')
}

/*
Adds a filter into an statement and update the variablesMapping of
the helper structure.
*/
const addFilter = (statement, filter, helper) => {
  let v = filter.variable ? 0 : filter.value
  switch (filter.field) {
    case 'id':case 'document':
      if (filter.condition === '=' || !filter.condition) {
        statement.where(filter.field, v)
      } else statement.where(filter.field, filter.condition, v)
      break
    default:// Condition over property
      let pt = MODEL.PROPERTIES[filter.field]
      if (pt) {
        statement.join('property_' + pt.type + '_1 as pf', (sq) => {
          sq.on('entity', 'id').on('property', filter.field)
          if (filter.condition === '=' || !filter.condition) sq.on('value', v)
          else sq.on('value', filter.condition, v)
          filterTime(sq, pt.time, {isArray: false}, helper.variablesMapping, true)
        })
      }
  }
}

/*
Prepares statement for relation query, and puts it into rels structure.
*/
const prepareRelation = (db, rels, forward) => {
  if (rels) {
    let l = []
    for (let p in rels) {
      if (rels.hasOwnProperty(p)) l.push(p)
    }
    rels._statement_ = db.from('relation_' + nodeId)
    .whereIn('relation', l)
    .where(forward ? 'id1' : 'id2', 0) // Fake entity id. It will be replaced in execution
  }
}

const prepareRelationInput = (db, rels, period) => {
  if (rels) {
    let l = []
    for (let p in rels) {
      if (rels.hasOwnProperty(p)) l.push(p)
    }
    rels._statement_ = db.from('input_rel_' + nodeId + '_' + period)
    .whereIn('relation', l)
    .where('entity', 0) // Fake entity id. It will be replaced in execution
  }
}

const preparePropertySubquery = (db, sq, type) => {
  if (sq && sq[type]) {
    let l = []
    for (let p in sq[type]) {
      if (sq[type].hasOwnProperty(p)) l.push(p)
    }
    sq[type]._statement_ = db.from('property_' + type + '_' + nodeId)
    .whereIn('property', l)
    .where('entity', 0) // Fake entity id. It will be replaced in execution
  }
}

const preparePropertySubqueryInput = (db, sq, type, period) => {
  if (sq && sq[type]) {
    let l = []
    for (let p in sq[type]) {
      if (sq[type].hasOwnProperty(p)) l.push(p)
    }
    sq[type]._statement_ = db.from('input_data_' + type + '_' + nodeId + '_' + period)
    .whereIn('property', l)
    .where('id', 0) // Fake entity id. It will be replaced in execution
  }
}

/*
Makes every join (if there is any) with direct properties (no history)
and put the result in str._guide_.statement
- db : Database
- str : Query structure
- e : Select over entity/input
- f: Entity/input fields
- type: type of entity, or period of inputs
*/
const joins = (db, str, e, f, type) => {
  let ps = str._guide_.property_fields
  let dr = str._guide_.direct_relations
  if ((ps && ps.length > 0) || (dr && dr.length > 0)) {
    let last
    // To avoid nulls
    if (!ps) ps = []
    if (!dr) dr = []

    let linkField = str._inputs_ ? '.id' : '.entity'
    // First, properties
    for (let i = 0; i < ps.length; i++) {
      // First a simple query over property table
      let propertyTable = str._inputs_
        ? 'input_data_' + ps[i].typeProperty + '_' + nodeId + '_' + type
        : 'property_' + ps[i].typeProperty + '_' + nodeId
      joinProperty(str, ps, i, propertyTable, e, linkField)
      last = ps[i].join
    }
    // Now, relations
    for (let i = 0; i < dr.length; i++) {
      joinRelation(db, str, dr, i, ps, e)
      last = dr[i].join
    }
    if (str._guide_.subquery) {
      str._guide_.subquery.leftJoin(last, str._guide_.link_field_1, str._guide_.link_field_2)
    } else str._guide_.statement = db.from(last)
  } else if (str._inputs_) str._guide_.statement = selectInput(db, f, type, str._filter_, str._guide_)
  else {
    if (str._guide_.subquery) str._guide_.subquery.leftJoin(e, str._guide_.link_field_1, str._guide_.link_field_2)
    else str._guide_.statement = selectEntity(db, f, type, str._filter_, str._guide_)
  }
  if (!str._guide_.subquery) {
    // Transform to raw for better use
    let sql = str._guide_.statement.toSQL()
    str._guide_.statement = db.raw(sql.sql, sql.bindings)
  }
}

const filterTime = (join, withtime, elem, variablesMapping, beginning) => {
  if (!elem.isArray) {
    join.onBetween('t1', [withtime ? CT.START_OF_TIME : CT.START_OF_DAYS, 0])
        .onBetween('t2', [0, withtime ? CT.END_OF_TIME : CT.END_OF_DAYS])
    let timeVar = withtime ? 'now' : 'today'
    if (beginning) {
      variablesMapping.unshift(null)
      variablesMapping.unshift(timeVar)
      variablesMapping.unshift(timeVar)
      variablesMapping.unshift(null)
    } else {
      variablesMapping.push(null)
      variablesMapping.push(timeVar)
      variablesMapping.push(timeVar)
      variablesMapping.push(null)
    }
  }
}

const joinProperty = (str, a, i, propertyTable, e, linkField) => {
  // Now, join with previous level
  a[i].join = sq => {
    let table = i === 0 ? 'e' : 'jps' + (i - 1)
    sq.from(i === 0 ? e : a[i - 1].join)
    let on = (j) => {
      // Now, the 'on' links, using index (id,relation,t1,t2)
      // First id
      j.on('ps' + i + linkField, table + '._id_')
      // Now, relation
      let pType = a[i].type
      j.onIn('ps' + i + '.property', [pType])
      str._guide_.variablesMapping.push(null) // 1 position in bindings is fixed
      if (!str._inputs_) {
        // Now date
        let withtime = MODEL.PROPERTIES[pType].time
        filterTime(j, withtime, a[i], str._guide_.variablesMapping)
      }
    }
    // If filter over property join, otherwise, left join
    if (a[i].filter) sq.join(propertyTable + ' as ps' + i, on)
    else sq.leftJoin(propertyTable + ' as ps' + i, on)

    // If additional filters, put them in 'where'
    if (a[i].filter) addFilter(sq, a[i].filter, str._guide_)
    // Select every column from previous joins
    sq.column(table + '.*')
    // Now, current relation columns. It could be just 'value' (the default)
    // or a list of fields.
    if (a[i].fields) {
      if (a[i].fields.value) {
        sq.column('ps' + i + '.value as ' + a[i].fields.value)
      }
      // Not just value, but we seek also t1 and t2
      if (a[i].fields.t1) {
        sq.column('ps' + i + '.t1 as ' + a[i].fields.t1)
        str._guide_.fields_to_remove.push(a[i].fields.t1)
      }
      if (a[i].fields.t2) {
        sq.column('ps' + i + '.t2 as ' + a[i].fields.t2)
        str._guide_.fields_to_remove.push(a[i].fields.t2)
      }
    } else sq.column('ps' + i + '.value as ' + a[i].entry)
    if (a[i].filter) addFilter(sq, a[i].filter, str._guide_)
    sq.as('jps' + i) // New alias for every join
  }
}

const joinRelation = (db, str, a, i, ps, e) => {
  // Now, join with previous level
  a[i].join = sq => {
    let table = i === 0 ? (ps.length > 0 ? ('jps' + (ps.length - 1)) : 'e') : 'jdr' + (i - 1)
    sq.from(i === 0 ? (ps.length > 0 ? ps[ps.length - 1].join : e) : a[i - 1].join)
    let on = (j) => {
      // Now, the 'on' links, using index (id,relation,t1,t2)
      // First id
      let linkField = a[i].forward ? '.id1' : '.id2'
      j.on('dr' + i + linkField, table + '._id_')
      // Now, relation
      let rType = a[i].type
      j.onIn('dr' + i + '.relation', [rType])
      str._guide_.variablesMapping.push(null) // 1 position in bindings is fixed
      if (!str._inputs_) {
        // Now date
        let withtime = MODEL.RELATIONS[rType].time
        filterTime(j, withtime, a[i], str._guide_.variablesMapping)
      }
    }
    // If filter over property join, otherwise, left join
    if (a[i].filter) sq.join('relation_' + nodeId + ' as dr' + i, on)
    else sq.leftJoin('relation_' + nodeId + ' as dr' + i, on)

    // If additional filters, put them in 'where'
    if (a[i].filter) addFilter(sq, a[i].filter, str._guide_)
    // Select every column from previous joins
    sq.column(table + '.*')
    // Now, current relation columns. It could be just 'value' (the default)
    // or a list of fields.
    if (a[i].fields) putRelationInfo(db, str, a[i], i, sq)
    else sq.column('dr' + i + (a[i].forward ? '.id2 as ' : '.id1 as ') + a[i].entry)
    if (a[i].filter) addFilter(sq, a[i].filter, str._guide_)
    sq.as('jdr' + i) // New alias for every join
  }
}

/*
Puts columns in subquery, about relation table.
- str: General query structure.
- info: Information about relation join.
- i: Index in joins array.
- subquery: Query for this join.
*/
const putRelationInfo = (db, str, info, i, subquery) => {
  if (info.nextEntity) {
    let prefix = 'r' + i + '_'
    // Objects: we put the id for next get
    // subquery.column('dr' + i + (info.forward ? '.id2 as ' : '.id1 as ') + prefix + 'id')
    info.nextEntity._prefix_ = prefix
    if (info.fields.t1) {
      subquery.column('dr' + i + '.t1 as ' + prefix + info.fields.t1)
      str._guide_.fields_to_remove.push(info.fields.t1)
    }
    if (info.fields.t2) {
      subquery.column('dr' + i + '.t2 as ' + prefix + info.fields.t2)
      str._guide_.fields_to_remove.push(info.fields.t2)
    }
    info.nextEntity._link_field_1_ = prefix + 'r.' + prefix + '_id_'
    info.nextEntity._link_field_2_ = 'dr' + i + (info.forward ? '.id2' : '.id1')
    info.nextEntity._subquery_ = subquery
    prepareGet(db, info.nextEntity)
    subquery.column(prefix + 'r' + '.*')
  } else {
    // One field, from the relation table
    if (info.fields.t1) {
      subquery.column('dr' + i + '.t1 as ' + info.fields.t1)
      str._guide_.fields_to_remove.push(info.fields.t1)
    }
    if (info.fields.t2) {
      subquery.column('dr' + i + '.t2 as ' + info.fields.t2)
      str._guide_.fields_to_remove.push(info.fields.t2)
    }
    if (info.fields.id1) subquery.column('dr' + i + '.id1 as ' + info.fields.id1)
    if (info.fields.id2) subquery.column('dr' + i + '.id2 as ' + info.fields.id2)
  }
}

/*
Analyze this level of str structure, and creates objects which
guide the program to do queries.
*/
const getFields = (str, session, forInputs) => {
  for (var property in str) {
    if (str.hasOwnProperty(property)) {
      if (property.charAt(0) === '_' &&
        property !== '_field_' &&
        property !== '_related_') {
      } else if (typeof str[property] === 'string') {
        str._guide_.entity_fields[str[property]] = property
        if (str[property] === 'intname') str._guide_.fields_to_parse.push(property)
      } else {
        // Properties or relations
        let type = str[property]._property_
        if (!type) type = str[property]._relation_
        let f = {entry: property, type: type}
        if (f.type.charAt(0) === '[') {
          f.isArray = true
          f.type = f.type.substring(1, f.type.length - 1)
        }
        if (forInputs && str[property]._relation_ === 'owner') {
          // Special case: predefined relation from 'owner' field
          str._guide_.relation_owner = f
          str._guide_.entity_fields.owner = '_owner_'
          str._guide_.fields_to_remove.push('_owner_')
          prepareRelatedObject(f, str[property], null, session)
        } else if (f.type.indexOf('->') >= 0) {
          f.type = f.type.substring(0, f.type.length - 2)
          f.forward = true
          if (f.isArray) {
            if (!str._guide_.relations_forward) str._guide_.relations_forward = {}
            str._guide_.relations_forward[f.type] = f
          } else {
            str._guide_.direct_relations.push(f)
          }
          prepareRelatedObject(f, str[property], true, session)
        } else if (f.type.indexOf('<-') >= 0) {
          f.type = f.type.substring(2, f.type.length)
          f.forward = false
          if (f.isArray) {
            if (!str._guide_.relations_backward) str._guide_.relations_backward = {}
            str._guide_.relations_backward[f.type] = f
          } else {
            str._guide_.direct_relations.push(f)
          }
          prepareRelatedObject(f, str[property], false, session)
        } else { // It's a property
          f.typeProperty = MODEL.getTypeProperty(f.type)
          // Get simple fields of the property
          for (var pf in str[property]) {
            if (str[property].hasOwnProperty(pf) && pf.charAt(0) !== '_') {
              if (!f.fields) f.fields = {}
              f.fields[str[property][pf]] = pf
            }
          }
          if (str[property]._filter_) f.filter = str[property]._filter_
          if (f.isArray) {
            if (!str._guide_.property_subqueries[f.typeProperty]) {
              str._guide_.property_subqueries[f.typeProperty] = {}
            }
            str._guide_.property_subqueries[f.typeProperty][f.type] = f
          } else str._guide_.property_fields.push(f)
        }
      }
    }
  }
}

/*
Puts every relation field in the descriptor (f).
- forward: indicates the direction of the relation.
- entry: is the name of the relation in the main structure.
*/
const prepareRelatedObject = (f, entry, forward, session) => {
  let nfields = 0
  for (let rf in entry) {
    if (!f.fields) f.fields = {}
    if (entry.hasOwnProperty(rf)) {
      if (entry[rf] === 't1') {
        f.fields.t1 = rf
        nfields++
      } else if (entry[rf] === 't2') {
        f.fields.t2 = rf
        nfields++
      } else if (entry[rf] === 'id') {
        if (forward === null) f.fields.id1 = rf
        else if (forward) f.fields.id2 = rf
        else f.fields.id1 = rf
        nfields++
      } else if (rf === '_relation_') {
      } else {
        // Related entity
        if (!f.nextEntity) f.nextEntity = {_linked_: true, _n_fields: 0}
        f.nextEntity[rf] = entry[rf]
        nfields++
      }
    }
  }
  if (f.nextEntity) {
    f.nextEntity._n_fields = nfields
    if (f.isArray) prepareGet(session, f.nextEntity)
  }
}

/*
Select execution
*/
const executeSelect = (str, variables, session, callback) => {
  // Variables substitution
  let v = str._guide_.variablesMapping
  let l = str._guide_.statement.bindings
  // logger.debug(v)
  // logger.debug(l)
  if (v) {
    for (let i = 0; i < l.length; i++) {
      if (v[i] !== null) l[i] = variables[v[i]]
    }
  }

  // logger.debug(str._guide_.statement.toSQL())
  let result
  str._guide_.statement
    .then((rows) => {
      result = rows
      return Promise.all(rows.map((row) => processRow(str, row, session, variables)))
    })
    .then(() => {
      if (str._related_) {
        result = result[0]._related_
        if (str._related_._relation_.charAt(0) !== '[') result = result[0]
      } else {
        if (!str._guide_.isArray) result = result[0]
      }
      callback(null, result)
    })
    .catch((err) => callback(err))
}

/*
For every row of the main query, does a select (if needed),
when there are related entities or historic properties.
*/
const processRow = (str, row, session, variables) => {
  return new Promise((resolve, reject) => {
    // Subqueries for properties
    executePropertySq(str, 'num', row)
      .then(() => executePropertySq(str, 'str', row))
      .then(() => executePropertySq(str, 'bin', row))
      .then(() => executeInputOwner(str, row, session, variables))
      .then(() => executeRelation(str, true, row, session, variables))
      .then(() => executeRelation(str, false, row, session, variables))
      .then(() => {
        finalRowTreatment(str, row)
        resolve()
      })
      .catch((err) => reject(err))
  })
}

const finalRowTreatment = (str, row, i) => {
  // Every related data which must be in an object, should be moved
  let dr = str._guide_.direct_relations
  if (dr) treatRelatedObject(dr, row)
  let r = str._guide_.fields_to_remove
  for (let j = 0; j < r.length; j++) {
    // We remove the hidden field _id_ and every extreme date
    if (r[j] === '_id_') delete row._id_
    else if (row[r[j]] === CT.END_OF_TIME ||
      row[r[j]] === CT.START_OF_TIME ||
      row[r[j]] === CT.START_OF_DAYS ||
      row[r[j]] === CT.END_OF_DAYS) delete row[r[j]]
  }
  r = str._guide_.fields_to_parse
  for (let j = 0; j < r.length; j++) {
    if (row[r[j]] !== undefined && row[r[j]] !== null) {
      row[r[j]] = JSON.parse(row[r[j]])
    }
  }
  // Also nulls
  for (let p in row) {
    // Nested relation have fields changed to r<i>_<field>
    if (row.hasOwnProperty(p)) {
      if (row[p] === undefined || row[p] === null) delete row[p]
    }
  }
}

/*
Puts information in a related object,
because now it is contained in
'row' array using prefixes and
should be mapped to proper fields
 */
const treatRelatedObject = (dr, row) => {
  for (let i = 0; i < dr.length; i++) {
    // For every direct relation with more than 1 field
    if (dr[i].nextEntity) {
      let prefix = dr[i].nextEntity._prefix_
      let o = {}
      if (dr[i].nextEntity._n_fields > 1) row[dr[i].entry] = o
      for (let p in row) {
        // Nested relation have fields changed to r<i>_<field>
        if (row.hasOwnProperty(p)) {
          if (p.startsWith(prefix)) {
            if (p !== prefix + '_id_') {
              if (dr[i].nextEntity._n_fields > 1) o[p.substring(prefix.length)] = row[p]
              else row[dr[i].entry] = row[p]
            }
            delete row[p]
          }
        }
      }
    }
  }
}

/*
Links input with owner entity
*/
const executeInputOwner = (str, row, session, variables) => {
  return new Promise((resolve, reject) => {
    let ow = str._guide_.relation_owner
    if (ow) {
      getNextEntity(ow, true, row, null, session, variables, (err) => {
        if (err) reject(err)
        else resolve()
      })
    } else resolve()
  })
}

/*
Calls get() for related entity
*/
const getNextEntity = (info, forward, parentRow, thisRow, session, variables, callback) => {
  // Already prepared, just substitute id (it's always the last condition)
  let s = info.nextEntity._guide_.statement
  let id = thisRow ? (forward ? thisRow.id2 : thisRow.id1) : parentRow._owner_
  if (id) {
    s.bindings[s.bindings.length - 1] = id
    // Recursively call get
    get(session, variables, info.nextEntity, (err, r) => {
      if (err) callback(err)
      else {
        let obj
        if (Array.isArray(r)) {
          if (r.length > 0) obj = r[0]
        } else obj = r
        completeRelation(obj, parentRow, info, thisRow, forward)
        callback()
      }
    })
  } else callback()
}

/*
For every row of the entity query, searches for related objects.
*/
const executeRelation = (str, forward, row, session, variables) => {
  return new Promise((resolve, reject) => {
    let sq = forward ? str._guide_.relations_forward : str._guide_.relations_backward
    if (sq) {
      // Modify query 'where' with current id
      let ss = sq._statement_._statements
      ss[ss.length - 1].value = row._id_
      sq._statement_
        .then((h) => processRelationRow(row, forward, sq, h, 0, session, variables, (err) => {
          if (err) reject(err)
          else resolve()
        }))
        .catch((err) => reject(err))
    } else resolve()
  })
}

/*
Process every row (h[k]) of the relation table, over an entity row (rows[i]).
- sq is the relations descriptor, which maps relation type to information about it.
- forward indicates the direction of the relation.
*/
const processRelationRow = (row, forward, sq, h, k, session, variables, callback) => {
  if (k >= h.length) callback()
  else {
    let info = sq[h[k].relation]
    if (info) {
      // Create a list or object for every relation
      if (!row[info.entry]) {
        if (info.isArray) row[info.entry] = []
      }
      if (info.fields) {
        if (info.nextEntity) {
          getNextEntity(info, forward, row, h[k], session, variables, (err) => {
            if (err) callback(err)
            else processRelationRow(row, forward, sq, h, k + 1, session, variables, callback)
          })
          // No entity needed, so just the relation fields
        } else {
          completeRelation({}, row, info, h[k], forward)
          processRelationRow(row, forward, sq, h, k + 1, session, variables, callback)
        }
        // No fields specified, we put just the id in a simple list
      } else {
        let d = forward ? h[k].id2 : h[k].id1
        if (info.isArray) row[info.entry].push(d)
        else row[info.entry] = d
        processRelationRow(row, forward, sq, h, k + 1, session, variables, callback)
      }
    }
  }
}

/*
Puts relation fields into the object to return (o),
which is part of the parent object (parentRow).
*/
const completeRelation = (o, parentRow, info, data, forward) => {
  if (forward) {
    if (info.fields.id2) o[info.fields.id2] = data.id2
  } else if (info.fields.id1) o[info.fields.id1] = data.id1
  if (info.fields.t1) {
    if (data.t1 && data.t1 !== CT.START_OF_DAYS &&
      data.t1 !== CT.START_OF_TIME) o[info.fields.t1] = data.t1
  }
  if (info.fields.t2) {
    if (data.t2 && data.t2 !== CT.END_OF_DAYS &&
      data.t2 !== CT.END_OF_TIME) o[info.fields.t2] = data.t2
  }
  if (info.isArray) parentRow[info.entry].push(o)
  else parentRow[info.entry] = o
}

/*
Executes a query for an historical property (which should generate an array)
over the entity row rows[i].
Returns true if execution changes to callback
*/
const executePropertySq = (str, type, row) => {
  return new Promise((resolve, reject) => {
    let sq = str._guide_.property_subqueries
    if (sq[type]) {
      let s = sq[type]._statement_
      let ss = s._statements
      ss[ss.length - 1].value = row._id_
      s.then((h) => {
        for (let k = 0; k < h.length; k++) {
          let info = sq[type][h[k].property]
          if (info) {
            // Create a list for every historic value
            if (!row[info.entry]) row[info.entry] = []
            if (info.fields) {
              let o = {}
              if (info.fields.value && h[k].value) o[info.fields.value] = h[k].value
              if (info.fields.t1 && h[k].t1 &&
                h[k].t1 !== CT.START_OF_TIME &&
                h[k].t1 !== CT.START_OF_DAYS) o[info.fields.t1] = h[k].t1
              if (info.fields.t2 && h[k].t2 &&
                h[k].t2 !== CT.END_OF_TIME &&
                h[k].t2 !== CT.END_OF_DAYS) o[info.fields.t2] = h[k].t2
              row[info.entry].push(o)
            } else row[info.entry].push(h[k].value)
          }
        }
        resolve()
      })
      .catch((err) => reject(err))
    } else resolve()
  })
}

/*
Modifies historical lists of a relation (rows), inserting the new element r.
 params.id contains the id of the entity to modify.
 */
const historicModifier = (rows, r, table, db, callback) => {
  // Elements to modify list
  let mods = []
  let doNothing = false
  // Iterate over historic
  for (let i = 0; i < rows.length; i++) {
    let e = rows[i]
    let sameObject = r.property ? e.value === r.value : e.id1 === r.id1 && e.id2 === r.id2
    // If everything is equal, do nothing
    if (e.t1 === r.t1 && e.t2 === r.t2 && sameObject) {
      doNothing = true
      break
    }
    // Work only if there is common time
    if (e.t1 <= r.t2 && e.t2 >= r.t1) {
      if (r.t1 > e.t1 && r.t2 < e.t2) {
        // e  ............................
        // r        .................
        mods.push({type: 1, e, r})
      } else if (r.t1 <= e.t1 && r.t2 >= e.t2) {
        // e        .................
        // r  ............................
        mods.push({type: 2, e, r})
      } else if (r.t2 <= e.t2 && r.t2 >= e.t1) {
        // e        .................
        // r  ...............
        mods.push({type: 3, e, r})
      } else if (r.t1 <= e.t2 && r.t1 >= e.t1) {
        // e  ...............
        // r        .................
        mods.push({type: 4, e, r})
      }
    }
  }
  if (doNothing) callback()
  else if (mods.length > 0) modifyHistoricEntry(db, table, mods, 0, false, callback)
  else {
    // No mix with other entries: just insert
    db.insert(r).into(table).then((count) => { callback() })
      .catch((err) => callback(err))
  }
}

const modifyHistoricEntry = (db, table, mods, i, inserted, callback) => {
  if (i >= mods.length) callback()
  else {
    // a.e is be database element and a.r new element coming from API
    let a = mods[i]
    let nextStep = (inserted) => modifyHistoricEntry(db, table, mods, i + 1, inserted, callback)
    let differentValue, reg, regNew
    if (a.e.relation) {
      differentValue = a.e.id1 !== a.r.id1 || a.e.id2 !== a.r.id2
      reg = db(table).where('relation', a.e.relation)
        .where('id1', a.e.id1).where('id2', a.e.id2).where('t1', a.e.t1)
      regNew = db(table).where('relation', a.r.relation)
        .where('id1', a.r.id1).where('id2', a.r.id2)
        .where('t1', a.r.t1)
    } else {
      differentValue = a.e.value !== a.r.value
      reg = db(table).where('property', a.e.property)
        .where('entity', a.e.entity).where('value', a.e.value).where('t1', a.e.t1)
      regNew = db(table).where('property', a.r.property)
        .where('entity', a.r.entity).where('value', a.r.value)
        .where('t1', a.r.t1)
    }
    switch (a.type) {
      case 1:// New into last
        if (differentValue) {
          // Last must be split
          let rigthR
          if (a.e.relation) {
            rigthR = {
              relation: a.e.relation,
              id1: a.e.id1,
              id2: a.e.id2,
              t1: utils.nextTime(a.r.t2),
              t2: a.e.t2,
              ord: 0,
              node: 1
            }
          } else {
            rigthR = {
              property: a.e.property,
              entity: a.e.entity,
              t1: utils.nextTime(a.r.t2),
              t2: a.e.t2,
              value: a.e.value
            }
          }
          a.e.t2 = utils.previousTime(a.r.t1)
          reg.update(a.e)
            .then((count) => {
              db.insert(rigthR).into(table).then((count) => {
                if (a.r.remove) nextStep(true)
                else {
                  db.insert(a.r).into(table).then((count) => nextStep(true))
                    .catch((err) => callback(err))
                }
              })
                .catch((err) => callback(err))
            })
            .catch((err) => callback(err))
        } else nextStep(true)
        break
      case 2:// Last into new. Simply override
        if (inserted || a.r.remove) {
          reg.delete().then((count) => nextStep(true))
            .catch((err) => callback(err))
        } else {
          reg.update(a.r)
            .then((count) => nextStep(true))
            .catch((err) => callback(err))
        }
        break
      case 3:// New contains left limit
        if (differentValue && !a.r.remove) {
          a.e.t1 = utils.nextTime(a.r.t2)
          reg.update(a.e)
            .then((count) => {
              if (inserted) nextStep(true)
              else {
                db.insert(a.r).into(table).then((count) => nextStep(true))
                  .catch((err) => callback(err))
              }
            })
            .catch((err) => callback(err))
        } else {
          reg.delete()
            .then((count) => {
              if (a.r.remove) nextStep(true)
              else if (inserted) {
                a.r.t2 = a.e.t2
                // r was already inserted: delete db register and update r to new t2
                regNew.update(a.r)
                  .then((count) => nextStep(inserted))
                  .catch((err) => callback(err))
              } else {
                // r was not inserted, so insert it now
                db.insert(a.r).into(table).then((count) => nextStep(true))
                  .catch((err) => callback(err))
              }
            })
            .catch((err) => callback(err))
        }
        break
      case 4:// New contains right limit
        if (differentValue && !a.r.remove) {
          a.e.t2 = utils.previousTime(a.r.t1)
          reg.update(a.e)
            .then((count) => {
              if (inserted) nextStep(true)
              else {
                db.insert(a.r).into(table).then((count) => nextStep(true))
                  .catch((err) => callback(err))
              }
            })
            .catch((err) => callback(err))
        } else {
          reg.delete()
            .then((count) => {
              if (a.r.remove) nextStep(true)
              else if (inserted) {
                a.r.t1 = a.e.t1
                // r was already inserted: delete db register and update r to new t2
                regNew.update(a.r)
                  .then((count) => nextStep(true))
                  .catch((err) => callback(err))
              } else {
                // r was not inserted, so insert it now
                db.insert(a.r).into(table).then((count) => nextStep(true))
                  .catch((err) => callback(err))
              }
            })
            .catch((err) => callback(err))
        }
        break
    }
  }
}

module.exports = {

  get: get,
  put: put,
  del: del,
  prepareGet: prepareGet

}
/*
const insert = (i) => {
  if (i >= 10000) return
  let a = {id: i, name: 'persona' + i, document: 'doc' + i, code: 'code' + i}
  knexObjects.insert(a).into('entity_1').then((id) => {
    logger.debug('insert ' + i)
    let b = {entity: i, property: 'language', t1: CT.START_OF_DAYS, t2: CT.END_OF_DAYS, value: 'es'}
    knexObjects.insert(b).into('property_str_1').then((id) => {
      let j = 10000 + i
      let c = {id: j, code: '' + j}
      knexObjects.insert(c).into('entity_1').then((id) => {
        let r = {id1: j, id2: i, relation: 'identifies', t1: CT.START_OF_DAYS, t2: CT.END_OF_DAYS, node: 1}
        knexObjects.insert(r).into('relation_1').then((id) => {
          let d = {entity: i, property: 'ttgroup', t1: CT.START_OF_DAYS, t2: CT.END_OF_DAYS, value: 'A01'}
          knexObjects.insert(d).into('property_str_1').then((id) => {
            let e = {entity: i, property: 'validity', t1: 20170401, t2: 20170805}
            knexObjects.insert(e).into('property_num_1').then((id) => {
              insert(i + 1)
            })
          })
        })
      })
    })
  })
}

insert(1) */

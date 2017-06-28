// -------------------------------------------------------------------------------------------
// Module for structured queries, using objects and a graph model.
// -------------------------------------------------------------------------------------------

const MODEL = require('./model')
const CT = require.main.require('./CT')
const logger = require.main.require('./utils/log').getLogger('db')

const knexObjects = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './db/SPEC/objects_1.db'
  },
  useNullAsDefault: true
})

const knexInputs = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './db/SPEC/inputs_1_2017.db'
  },
  useNullAsDefault: true
})

let nodeId = 1

/*
Main visible function for getting data.
-db: Database
-variables: Variables used by the query
-str: Structure for query
-callback: Callback function
*/
const get = (db, variables, str, callback) => {
  if (!str._guide_) {
    if (!prepareGet(db, str)) {
      callback(new Error('Syntax error'))
      return
    }
  }
  executeSelect(str, variables, callback)
}

/*
 Main visible function for putting data.
 -db: Database
 -variables: Variables used by the query
 -str: Structure for put process
 -data: Data to insert
 -callback: Callback function
 */
const put = (stateService, db, variables, str, data, callback) => {
  let e = str._entity_
  if (e) {
    let keysData = MODEL.ENTITIES[e].keys
    if (keysData) {
      searchFromKey(e, keysData, str._keys_, stateService, data, (err, id) => {
        if (err) {
          stateService.releaseKey(e, keysData)
          callback(err)
        } else {
          if (id) {
            executeUpdate(id, str, data, variables, (err, count) => {
              // Once the job is done, release key and return
              if (err) {
                if (str._keys_) stateService.releaseKey(e, keysData)
                callback(err)
              } else {
                if (str._keys_) stateService.releaseKey(e, keysData)
                callback(null, count)
              }
            })
          } else {
            // On insert, we need to block key data to prevent parallel inserts over same key
            let id = stateService.getIdFor(e, keysData)
            executeInsert(id, keysData, str, data, variables, (err, rowid) => {
              // Once the job is done, release key and return
              if (err) {
                stateService.releaseKey(e, keysData)
                callback(err)
              } else {
                stateService.releaseKey(e, keysData)
                callback(null, rowid)
              }
            })
          }
        }
      })
    } else callback(new Error('Key not found'))
  } callback(new Error('Type not found'))
}

/*
Searches a list of keys for this entity type.
- entity: Entity type.
- keysData: List of keys which must be satisfied for this entity type.
- userKey: Concrete key the user want to use to search.
- stateService: Service which blocks keys and gives id's
- data: Data to insert/update
Once done, calls callback function passing:
- err: Error, if any
- id: Id of the entity found for the userKey of for the first key if userKey not specified
- conflict: True if there are other entities that have values
for some of the keys which would be repeated if data is inserted.
*/
const searchFromKey = (entity, keysData, userKey, stateService, data, callback) => {
  // Deny inserts or updates over this entity keys
  stateService.blockKey(entity, keysData, data)
  if (userKey == null) {
    // No key specified, we search the first with data
    for (let i = 0; i < keysData.length; i++) {
      let key = keysData[i]
      let ok = false
      for (let j = 0; j < key.length; j++) {
        if (data.hasOwnProperty(key[j])) ok = true
      }
      if (ok) {
        userKey = key
        break
      }
    }
  }
}

const executeInsert = (id, str, data, variables, callback) => {
  if (str._entity_) {
    // We pass every data to a new object d
    let d = getProperFields(str, data)
    // And we add id to insert
    d.id = id
    knexObjects.insert(data).into('entity_1').then((rowid) => {
      callback(null, rowid)
    })
    .catch((err) => callback(err))
  }
}

const executeUpdate = (id, str, data, variables, callback) => {
  if (str._entity_) {
    let d = getProperFields(str, data)
    let s = knexObjects('entity_1')
    s.where('id', id).update(d).then((count) => {
      callback(null, count)
    })
    .catch((err) => callback(err))
  }
}

const getProperFields = (str, data) => {
  let d = {}
  for (var p in str) {
    if (str.hasOwnProperty(p) &&
      p.charAt(0) !== '_' &&
      typeof str[p] === 'string' &&
      data[p] !== null) d[p] = data[p]
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
const prepareGet = (db, str) => {
  db = str._inputs_ ? knexInputs : knexObjects
  str._guide_ = {entity_fields: {},
    property_fields: [],
    property_subqueries: {},
    direct_relations: [],
    variablesMapping: []}
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
  getFields(str, db, str._inputs_)
  if (str._entity_ || str._linked_) {
    let f = str._guide_.entity_fields

    // Select over ENTITY
    if (!str._guide_.subquery) str._guide_.variablesMapping.push(null) // 1 position in bindings is fixed
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
  if (filter) addFilter(s, filter, helper)
  if (type) s.where('type', type)
  else if (!helper.subquery) s.where('id', 0)
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
  if (filter.condition === '=' || !filter.condition) {
    statement.where(filter.field, v)
  } else statement.where(filter.field, filter.condition, v)
  if (filter.variable) {
    helper.variablesMapping.push(filter.variable)
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
    logger.debug(str._guide_.statement.toSQL())
  }
}

const filterTime = (join, withtime, elem, variablesMapping) => {
  if (!elem.isArray) {
    join.onBetween('t1', [withtime ? CT.START_OF_TIME : CT.START_OF_DAYS, 0])
      .onBetween('t2', [0, withtime ? CT.END_OF_TIME : CT.END_OF_DAYS])
    if (withtime) {
      variablesMapping.push(null)
      variablesMapping.push('now')
      variablesMapping.push('now')
      variablesMapping.push(null)
    } else {
      variablesMapping.push(null)
      variablesMapping.push('today')
      variablesMapping.push('today')
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
      logger.debug('push null property')
      // Now date
      let withtime = MODEL.PROPERTIES[pType].time
      filterTime(j, withtime, a[i], str._guide_.variablesMapping)
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
      // Now date
      let withtime = MODEL.RELATIONS[rType].time
      filterTime(j, withtime, a[i], str._guide_.variablesMapping)
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
    info.nextEntity._subquery_ = subquery
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
    prepareGet(db, info.nextEntity)
    subquery = info.nextEntity._guide_.subquery
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
const getFields = (str, db, forInputs) => {
  for (var property in str) {
    if (str.hasOwnProperty(property)) {
      if (property.charAt(0) === '_' && property !== '_field_') {
      } else if (typeof str[property] === 'string') {
        str._guide_.entity_fields[str[property]] = property
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
          prepareRelatedObject(f, str[property], null, db)
        } else if (f.type.indexOf('->') >= 0) {
          f.type = f.type.substring(0, f.type.length - 2)
          f.forward = true
          if (f.isArray) {
            if (!str._guide_.relations_forward) str._guide_.relations_forward = {}
            str._guide_.relations_forward[f.type] = f
          } else {
            str._guide_.direct_relations.push(f)
          }
          prepareRelatedObject(f, str[property], true, db)
        } else if (f.type.indexOf('<-') >= 0) {
          f.type = f.type.substring(2, f.type.length)
          f.forward = false
          if (f.isArray) {
            if (!str._guide_.relations_backward) str._guide_.relations_backward = {}
            str._guide_.relations_backward[f.type] = f
          } else {
            str._guide_.direct_relations.push(f)
          }
          prepareRelatedObject(f, str[property], false, db)
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
const prepareRelatedObject = (f, entry, forward, db) => {
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
    if (f.isArray) prepareGet(db, f.nextEntity)
  }
}

/*
Select execution
*/
const executeSelect = (str, variables, callback) => {
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
  str._guide_.statement
    .then((rows) => processRow(str, rows, 0, callback))
    .catch((err) => callback(err))
}

/*
For every row of the main query, does a select,
because there are related entities or historic properties.
*/
const processRow = (str, rows, i, callback) => {
  let execution = {change: false}
  if (i >= rows.length) callback(null, rows)
  else {
    while (!execution.change && i < rows.length) {
      // Subqueries for properties
      executePropertySq(str, 'num', rows, i, execution, (err) => {
        if (err) callback(err)
        else {
          executePropertySq(str, 'str', rows, i, execution, (err) => {
            if (err) callback(err)
            else {
              executePropertySq(str, 'bin', rows, i, execution, (err) => {
                if (err) callback(err)
                else {
                  executeInputOwner(str, rows, i, execution, (err) => {
                    if (err) callback(err)
                    else {
                      executeRelation(str, true, rows, i, execution, (err) => {
                        if (err) callback(err)
                        else {
                          executeRelation(str, false, rows, i, execution, (err) => {
                            if (err) callback(err)
                            else {
                              // Every related data which must be in an object, shoud be moved
                              let dr = str._guide_.direct_relations
                              if (dr) treatRelatedObject(dr, rows[i])
                              let r = str._guide_.fields_to_remove
                              for (let j = 0; j < r.length; j++) {
                                // We remove the hidden field _id_ and every extreme date
                                if (r[j] === '_id_') delete rows[i]._id_
                                else if (rows[i][r[j]] === CT.END_OF_TIME ||
                                  rows[i][r[j]] === CT.START_OF_TIME ||
                                  rows[i][r[j]] === CT.END_OF_DAYS ||
                                  rows[i][r[j]] === CT.END_OF_DAYS) delete rows[i][r[j]]
                              }
                              // Next row
                              if (execution.change) processRow(str, rows, i + 1, callback)
                            }
                          })
                        }
                      })
                    }
                  })
                }
              })
            }
          })
        }
      })
      // No callback change, so iterate
      if (!execution.change) i++
    }
    if (!execution.change) callback(null, rows)
  }
}

/*
Puts information in a related object
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
const executeInputOwner = (str, rows, i, execution, callback) => {
  let ow = str._guide_.relation_owner
  if (ow) {
    getNextEntity(ow, true, rows[i], null, execution, callback)
  } else callback()
}

/*
Calls get() for related entity
*/
const getNextEntity = (info, forward, parentRow, thisRow, execution, callback) => {
  // Already prepared, just substitute id (it's always the last condition)
  let s = info.nextEntity._guide_.statement
  let id = thisRow ? (forward ? thisRow.id2 : thisRow.id1) : parentRow._owner_
  if (id) {
    s.bindings[s.bindings.length - 1] = id
    // Recursively call get
    get(null, null, info.nextEntity, (err, r) => {
      if (err) callback(err)
      else {
        if (r.length > 0) completeRelation(r[0], parentRow, info, thisRow, forward)
        callback()
      }
    })
    execution.change = true
  } else callback()
}

/*
For every row of the entity query, searches for related objects.
*/
const executeRelation = (str, forward, rows, i, execution, callback) => {
  let sq = forward ? str._guide_.relations_forward : str._guide_.relations_backward
  if (sq) {
    // Modify query 'where' with current id
    let ss = sq._statement_._statements
    ss[ss.length - 1].value = rows[i]._id_
    sq._statement_
      .then((h) => processRelationRow(rows, i, forward, sq, h, 0, callback))
      .catch((err) => callback(err))
    execution.change = true
  } else callback()
}

/*
Process every row (h[k]) of the relation table, over an entity row (rows[i]).
- sq is the relations descriptor, which maps relation type to information about it.
- forward indicates the direction of the relation.
*/
const processRelationRow = (rows, i, forward, sq, h, k, callback) => {
  let execution = {change: false}
  if (k >= h.length) callback()
  else {
    let info = sq[h[k].relation]
    if (info) {
      // Create a list or object for every relation
      if (!rows[i][info.entry]) {
        if (info.isArray) rows[i][info.entry] = []
      }
      if (info.fields) {
        if (info.nextEntity) {
          getNextEntity(info, forward, rows[i], h[k], execution, (err) => {
            if (err) callback(err)
            else processRelationRow(rows, i, forward, sq, h, k + 1, callback)
          })
          // No entity needed, so just the relation fields
        } else {
          completeRelation({}, rows[i], info, h[k], forward)
          processRelationRow(rows, i, forward, sq, h, k + 1, callback)
        }
        // No fields specified, we put just the id in a simple list
      } else {
        let d = forward ? h[k].id2 : h[k].id1
        if (info.isArray) rows[i][info.entry].push(d)
        else rows[i][info.entry] = d
        processRelationRow(rows, i, forward, sq, h, k + 1, callback)
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
    if (data.t1 !== CT.START_OF_DAYS && data.t1 !== CT.START_OF_TIME) o[info.fields.t1] = data.t1
  }
  if (info.fields.t2) {
    if (data.t2 !== CT.END_OF_DAYS && data.t2 !== CT.END_OF_TIME) o[info.fields.t2] = data.t2
  }
  if (info.isArray) parentRow[info.entry].push(o)
  else parentRow[info.entry] = o
}

/*
Executes a query for an historical property (which should generate an array)
over the entity row rows[i].
Returns true if execution changes to callback
*/
const executePropertySq = (str, type, rows, i, execution, callback) => {
  let sq = str._guide_.property_subqueries
  if (sq[type]) {
    let s = sq[type]._statement_
    let ss = s._statements
    ss[ss.length - 1].value = rows[i]._id_
    s.then((h) => {
      for (let k = 0; k < h.length; k++) {
        let info = sq[type][h[k].property]
        if (info) {
          // Create a list for every historic value
          if (!rows[i][info.entry]) rows[i][info.entry] = []
          if (info.fields) {
            let o = {}
            if (info.fields.value) o[info.fields.value] = h[k].value
            if (info.fields.t1) o[info.fields.t1] = h[k].t1
            if (info.fields.t2) o[info.fields.t2] = h[k].t2
            rows[i][info.entry].push(o)
          } else rows[i][info.entry].push(h[k].value)
        }
      }
      callback()
    })
    .catch((err) => callback(err))
    execution.change = true
  } else callback()
}

module.exports = {

  get: get,
  put: put,
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

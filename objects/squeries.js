// -------------------------------------------------------------------------------------------
// Module for structured queries, using objects and a graph model.
// -------------------------------------------------------------------------------------------

const MODEL = require('./model')
// const CT = require.main.require('./CT')
const CT = require('../CT')

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
    if (!prepare(db, str, variables)) callback(new Error('Syntax error'))
  }
  execute(str, callback)
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
- relations_forward, relations_backward: Maps for relations (for inputs, only forward).
  Each map has relation type as key, and as value, an object like:
  {entry: <entry name>, type: <relation name>, isArray:{false}}
  Each map contains, additionaly, the _statement_ property, with the
  statement to be executed.
- relation_owner: Only for inputs which must be linked with owner entity
*/
const prepare = (db, str, variables) => {
  db = str._inputs_ ? knexInputs : knexObjects
  str._guide_ = {entity_fields: {},
    property_fields: [],
    property_subqueries: {}}

  let type = str._entity_ ? str._entity_
  : (str._property_ ? str._property_
    : (str._relation_ ? str._relation_ : str._inputs_))

  if (type) {
    if (type.charAt(0) === '[') {
      str._guide_.isArray = true
      type = type.substring(1, type.length - 1)
    } else str._guide_.isArray = false
  }
  // Always a hidden id of the entity
  str._guide_.fields_to_remove = ['_id_']
  getFields(str, db, str._inputs_)
  if (str._entity_ || str._linked_) {
    let f = str._guide_.entity_fields

    // Select over ENTITY
    let e = sq => {
      selectEntity(sq, f, type)
    }
    joinProperties(db, str, e, f, type)
    preparePropertySubquery(db, str._guide_.property_subqueries, 'str')
    preparePropertySubquery(db, str._guide_.property_subqueries, 'num')
    preparePropertySubquery(db, str._guide_.property_subqueries, 'bin')
    prepareRelation(db, str._guide_.relations_forward, true)
    prepareRelation(db, str._guide_.relations_backward, false)
  } else if (str._inputs_) {
    let f = str._guide_.entity_fields
    // Select over INPUTS
    let e = sq => {
      selectInput(sq, f, type)
    }
    joinProperties(db, str, e, f, type)
    preparePropertySubqueryInput(db, str._guide_.property_subqueries, 'str', type)
    preparePropertySubqueryInput(db, str._guide_.property_subqueries, 'num', type)
    preparePropertySubqueryInput(db, str._guide_.property_subqueries, 'bin', type)
    prepareRelationInput(db, str._guide_.relations_forward, type)
  }
  return true
}

/*
Basic select over entity table
*/
const selectEntity = (sq, f, type) => {
  let s = sq.from('entity_' + nodeId)
  s.column('id as _id_')
  for (var c in f) {
    if (f.hasOwnProperty(c)) s.column(c + ' as ' + f[c])
  }
  if (type) s.where('type', type).as('e')
  else s.where('id', 0).as('e')
  return s
}

/*
Basic select over inputs table
*/
const selectInput = (sq, f, period) => {
  let s = sq.from('input_' + nodeId + '_' + period)
  s.column('id as _id_')
  for (var c in f) {
    if (f.hasOwnProperty(c)) s.column(c + ' as ' + f[c])
  }
  return s.as('e')
}

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
const joinProperties = (db, str, e, f, type) => {
  let ps = str._guide_.property_fields
  let linkField = str._inputs_ ? '.id' : '.entity'
  if (ps && ps.length > 0) {
    for (let i = 0; i < ps.length; i++) {
      // First a simple query over property table
      let propertyTable = str._inputs_
        ? 'input_data_' + ps[i].typeProperty + '_' + nodeId + '_' + type
        : 'property_' + ps[i].typeProperty + '_' + nodeId
      ps[i].stProperty = sq => {
        sq.from(propertyTable)
          .as('pr' + i)
          .where('property', ps[i].type).as('pr' + i)
      }
      // Now, join with previous level
      ps[i].join = sq => {
        let table = i === 0 ? 'e' : 'jpr' + (i - 1)
        sq.from(i === 0 ? e : ps[i - 1].join)
          .leftJoin(ps[i].stProperty, 'pr' + i + linkField, table + '._id_')
          .column(table + '.*')
        // Now, property columns. It could be just 'value' (the default)
        // or a list of fields.
        if (ps[i].fields) {
          // Not just value, but we seek also t1 and t2
          if (ps[i].fields.value) sq.column('pr' + i + '.value as ' + ps[i].fields.value)
          if (ps[i].fields.t1) {
            sq.column('pr' + i + '.t1 as ' + ps[i].fields.t1)
            str._guide_.fields_to_remove.push(ps[i].fields.t1)
          }
          if (ps[i].fields.t2) {
            sq.column('pr' + i + '.t2 as ' + ps[i].fields.t2)
            str._guide_.fields_to_remove.push(ps[i].fields.t2)
          }
        } else sq.column('pr' + i + '.value as ' + ps[i].entry)
        sq.as('jpr' + i) // New alias for every join
      }
    }
    str._guide_.statement = db.from(ps[ps.length - 1].join)
  } else if (str._inputs_) str._guide_.statement = selectInput(db, f, type)
  else str._guide_.statement = selectEntity(db, f, type)
}

/*
Analyze this level of str, and creates structures which
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
          if (!str._guide_.relations_forward) str._guide_.relations_forward = {}
          f.type = f.type.substring(0, f.type.length - 2)
          str._guide_.relations_forward[f.type] = f
          prepareRelatedObject(f, str[property], true, db)
        } else if (f.type.indexOf('<-') >= 0) {
          if (!str._guide_.relations_backward) str._guide_.relations_backward = {}
          f.type = f.type.substring(2, f.type.length)
          str._guide_.relations_backward[f.type] = f
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

const prepareRelatedObject = (f, entry, forward, db) => {
  for (let rf in entry) {
    if (!f.fields) f.fields = {}
    if (entry.hasOwnProperty(rf)) {
      if (rf === 't1') f.fields.t1 = rf
      else if (rf === 't2') f.fields.t2 = rf
      else if (rf === 'id') {
        if (forward === null) f.fields.id = rf
        else if (forward) f.fields.id2 = rf
        else f.fields.id1 = rf
      } else if (rf === '_relation_') {
      } else {
        // Related entity
        if (!f.nextEntity) f.nextEntity = {_linked_: true}
        f.nextEntity[rf] = entry[rf]
      }
    }
  }
  if (f.nextEntity) prepare(db, f.nextEntity, null)
}

const execute = (str, callback) => {
  str._guide_.statement.then((rows) => {
    processRow(str, rows, 0, callback)
  })
  .catch((err) => callback(err))
}

/*
For every row of the main query, does a select,
because there are related entities or historic properties.
*/
const processRow = (str, rows, i, callback) => {
  if (i >= rows.length) callback(null, rows)
  else {
    // Subqueries for properties
    executePropertySq(str, 'num', rows, i, (err) => {
      if (err) callback(err)
      else {
        executePropertySq(str, 'str', rows, i, (err) => {
          if (err) callback(err)
          else {
            executePropertySq(str, 'bin', rows, i, (err) => {
              if (err) callback(err)
              else {
                executeInputOwner(str, rows, i, (err) => {
                  if (err) callback(err)
                  else {
                    executeRelation(str, true, rows, i, (err) => {
                      if (err) callback(err)
                      else {
                        executeRelation(str, false, rows, i, (err) => {
                          if (err) callback(err)
                          else {
                            let r = str._guide_.fields_to_remove
                            // We remove the hidden field _id_ and every extreme date
                            for (let j = 0; j < r.length; j++) {
                              if (r[j] === '_id_') delete rows[i]._id_
                              else if (rows[i][r[j]] === CT.END_OF_TIME ||
                                rows[i][r[j]] === CT.START_OF_TIME) delete rows[i][r[j]]
                            }
                            // Next row
                            processRow(str, rows, i + 1, callback)
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
  }
}

/*
Links input with owner entity
*/
const executeInputOwner = (str, rows, i, callback) => {
  let ow = str._guide_.relation_owner
  if (ow) {
    getNextEntity(ow, true, rows[i], null, callback)
  } else callback()
}

/*
Calls get() for related entity
*/
const getNextEntity = (info, forward, parentRow, thisRow, callback) => {
  // Already prepared, just substitute id (it's always the last condition)
  let s = info.nextEntity._guide_.statement
  console.log(parentRow)
  let id = thisRow ? (forward ? thisRow.id2 : thisRow.id1) : parentRow._owner_
  if (id) {
    s._statements[s._statements.length - 1].value = id
    // Recursively call get
    get(null, null, info.nextEntity, (err, r) => {
      if (err) callback(err)
      else {
        if (r.length > 0) completeRelation(r[0], parentRow, info, thisRow, forward)
        callback()
      }
    })
  } else callback()
}

/*
For every row of the entity query, searches for related objects.
*/
const executeRelation = (str, forward, rows, i, callback) => {
  let sq = forward ? str._guide_.relations_forward : str._guide_.relations_backward
  if (sq) {
    // Modify query 'where' with current id
    let ss = sq._statement_._statements
    ss[ss.length - 1].value = rows[i]._id_
    sq._statement_
      .then((h) => processRelationRow(rows, i, forward, sq, h, 0, callback))
      .catch((err) => callback(err))
  } else callback()
}

const processRelationRow = (rows, i, forward, sq, h, k, callback) => {
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
          getNextEntity(info, forward, rows[i], h[k], (err) => {
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

const completeRelation = (o, parentRow, info, data, forward) => {
  if (forward) {
    if (info.fields.id2) o[info.fields.id2] = data.id2
  } else if (info.fields.id1) o[info.fields.id1] = data.id1
  if (info.fields.t1) o[info.fields.t1] = data.t1
  if (info.fields.t2) o[info.fields.t2] = data.t2
  if (info.isArray) parentRow[info.entry].push(o)
  else parentRow[info.entry] = o
}

const executePropertySq = (str, type, rows, i, callback) => {
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
  } else callback()
}

module.exports = {

  get: get

}

/*
 get(knex, null, {_entity_: 'record',
  nombre: 'name',
  codigo: 'code',
  idioma: {_property_: 'language'},
  incidencias: {_property_: 'ttgroup'},
  validez: {_property_: '[validity]', start: 't1', end: 't2'},
  tarjeta: {_relation_: '[<-identifies]', code: 'code'}
},
(err, rows) => {
  if (err) console.log(err)
  else console.log(rows)
  process.exit(0)
}) */

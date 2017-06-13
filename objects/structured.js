// -------------------------------------------------------------------------------------------
// Module for structured queries, using objects and a graph model.
// -------------------------------------------------------------------------------------------

const MODEL = require('./model')
const CT = require.main.require('./CT')
const logger = require.main.require('./utils/log').getLogger('db')

var nodeId = 1

/*
Main visible function for getting data.
-db: Database
-str: Structure for query
-callback: Callback function
*/
const structuredGet = (db, variables, str, callback) => {
  var definition = getDefinition(str)
  var select = getSimpleFields(str)
  var subqueries = getSubqueries(str)
  var filter = getFilter(str)

  switch (definition.what) {
    case 'entity':selectEntity(db, str, definition, filter, select, subqueries, callback)
      break
    case 'property':
      break
    case 'relation':
      break
  }
}

const selectEntity = (db, str, definition, filter, select, subqueries, callback) => {
  var where
  let fields
  if (str._subquery_) fields = ''
  else fields = ',' + (select ? select.complete : '*')
  var query = 'SELECT id _id_' + fields + ' FROM entity_' + nodeId
  if (str._entity_) where = " where type='" + definition.type + "'"
  if (filter) {
    if (where) where += ' and (' + filter + ')'
    else where = ' where ' + filter
  }
  if (where) query += where

  query = getPropertyFields(query, str)
  logger.trace(query)
  db.all(query, [], function (err, rows) {
    if (err) callback(err)
    else {
      if (subqueries) {
        // If entity must be avoided, some additional treatment is needed
        if (str._subquery_) {
          processRow(db, rows, 0, subqueries, 0, (err) => {
            if (err) callback(err)
            else callback(null, rows[0]._subquery_)
          })
        } else {
          processRow(db, rows, 0, subqueries, 0, (err) => {
            if (err) callback(err)
            else if (definition.isArray) callback(null, rows)
            else callback(null, rows[0])
          })
        }
      } else {
        for (var i = 0; i < rows.length; i++) {
          delete rows[i]._id_
          cleanRow(rows[i])
        }
        logger.trace(definition.isArray)
        if (!definition.isArray) {
          if (rows.length > 0) callback(null, rows[0])
          else callback(null, null)
        } else callback(err, rows)
      }
    }
  })
}

/*
Main visible function for putting data.
Parameter params is an object which contains
-customer: Name of customer
-stateService: Service which gives new ids
-db: Database
-data: Data to put
-str: Structure for query
-callback: Callback function
-parent: If this put depends on a parent objects, its id
-entity: Type of entity
-property: Type of property
-relation: Type of relation
*/
const structuredPut = (params) => {
  let definition = getDefinition(params.str)
  if (params.str._property_) {
    switch (params.str._op_) {
      case 'complete':putCompleteProperty(definition, params)
        break
      default: putSimpleProperty(definition, params)
    }
  } else if (params.str._relation_) {
    switch (params.str._op_) {
      case 'complete':putCompleteRelation(definition, params)
        break
      default: putSimpleRelation(definition, params)
    }
  } else {
    // TODO: Block key before insert
    // First we search for the id of the entity to update, or to check if insert/put
    let query = 'SELECT id FROM entity_' + nodeId + ' where ' +
      (params.str._entity_ ? 'type=\'' + params.str._entity_ + '\' and ' : '')
    let vals
    if (params.str._key_) {
      query += params.str[params.str._key_] + '=?'
      vals = [params.data[params.str._key_]]
    } else {
      query += params.str._filter_
      vals = []
    }
    logger.trace(query)
    logger.trace(vals)
    params.db.all(query, vals, function (err, rows) {
      if (err) params.callback(err)
      else {
        let op = params.str._op_
        if (rows.length === 0) {
          if (op === 'search' || op === 'update') params.callback(new Error('No object found'))
          else {
            // If no rows, it must be an insert, and we must search for a new id
            params.stateService.new_id(params.customer, (err, newid) => {
              if (err) params.callback(err)
              else {
                let f = params.callback
                params.callback = (err) => {
                  if (err) f(err)
                  else f(null, newid)
                }
                doPut('insert', newid, params)
              }
            })
          }
        } else {
          let f = params.callback
          params.callback = (err) => {
            if (err) f(err)
            else f(null, rows[0].id)
          }
          if (op === 'search') {
          // We are only searching for insertin related information
            let substatements = getSubStatements(params.str)
            if (substatements) runInternalPuts(substatements, 0, rows[0].id, params)
            else params.callback(null, rows[0].id)
          } else doPut('update', rows[0].id, params)
        }
      }
    })
  }
}

/*
Builds the SQL sentence from data and str, and executes it.
Returns the id of the entity which was created or updated.
*/
const doPut = (op, id, params) => {
  var substatements = getSubStatements(params.str)
  var fields = getValues(params.str, params.data)
  var statement
  let vals
  let list
  switch (op) {
    case 'insert':
      for (let i = 0; i < fields.fields.length; i++) {
        if (list) list += ',' + fields.fields[i]
        else list = fields.fields[i]
        if (vals) vals += ',?'
        else vals = '?'
      }
      statement = 'INSERT INTO entity_' + nodeId +
     '(' + list + ',type,id) values (' + vals + ',?,?)'
      fields.values.push(params.str._entity_)
      break
    case 'update':
    // TODO: Select before update, to ensure only modify when needed
      for (let i = 0; i < fields.fields.length; i++) {
        if (vals) vals += ',' + fields.fields[i] + '=?'
        else vals = fields.fields[i] + '=?'
      }
      statement = 'UPDATE entity_' + nodeId + ' set ' + vals + ' where id=?'
      break
  }
  fields.values.push(id)
  params.db.run(statement, fields.values, function (err, result) {
    if (err) {
      err.message = err.message + ' : ' + statement
      params.callback(err)
    } else {
      logger.trace(statement)
      if (substatements) runInternalPuts(substatements, 0, id, params)
      else params.callback(null, id)
    }
  })
}

/*
Recursively calls structuredPut over some entry, and then continues
until substatements list is completely processed.
*/
const runInternalPuts = (substatements, i, id, params) => {
  if (i >= substatements.length) params.callback()
  else {
    let sq = substatements[i]
    let data = sq._entry_name_ === '_subquery_' ? params.data : params.data[sq._entry_name_]
    logger.trace(data)
    if (data) {
      var newParams = {
        parent: id,
        entity: params.str._entity_,
        customer: params.customer,
        db: params.db,
        stateService: params.stateService,
        data: data,
        str: params.str[sq._entry_name_],
        callback: function (err, result) {
          if (err) params.callback(err)
          else runInternalPuts(substatements, i + 1, id, params)
        }
      }
      structuredPut(newParams)
    } else runInternalPuts(substatements, i + 1, id, params)
  }
}

const putSimpleProperty = (definition, params) => {
  // TODO: If property is a key, block before insert
  let table = 'property_' + MODEL.getTypeProperty(definition.type) + '_' + nodeId
  let sql = 'SELECT value from ' + table + ' where entity=? and property=?'
  params.db.all(sql, [params.parent, definition.type], (err, rows) => {
    if (err) params.callback(err)
    else {
      let values
      if (rows.length === 0) {
        sql = 'INSERT into ' + table + '(entity,property,value,t1,t2) values (?,?,?,?,?)'
        values = [params.parent, definition.type, params.data, CT.START_OF_TIME, CT.END_OF_TIME]
      } else {
        sql = 'UPDATE ' + table + ' set value=? where entity=? and property=?'
        values = [params.data, params.parent, definition.type]
      }
      logger.trace(sql)
      logger.trace(values)
      params.db.run(sql, values, (err) => { params.callback(err) })
    }
  })
}

const putSimpleRelation = (definition, params) => {
  let r = definition.type
  let inverse = false
  if (r.charAt(0) === '<') {
    r = r.substring(2, r.length)
    inverse = true
  } else {
    r = r.substring(0, r.length - 2)
  }
  // First, search the related entity and create it if needed
  var str = {
    _entity_: MODEL.getRelatedEntity(r, params.entity, inverse),
    _key_: params.str._key_
  }
  if (params.str._field_) str[params.str._entry_name_] = params.str._field_
  else {
    for (var property in params.str) {
      if (params.str.hasOwnProperty(property)) {
        if (property.charAt(0) !== '_' && isEntityField(params.str[property])) {
          str[property] = params.str[property]
        }
      }
    }
  }
  var newParams = {
    customer: params.customer,
    db: params.db,
    stateService: params.stateService,
    data: definition.isArray ? params.data[0] : params.data,
    str: str,
    callback: function (err, result) {
      if (err) params.callback(err)
      else link(params, inverse, r, result)
    }
  }
  logger.trace(newParams)
  structuredPut(newParams)
}

const link = (params, inverse, r, relatedId) => {
  let sql = 'SELECT ' + (inverse ? 'id1' : 'id2') +
  ' id from relation_' + nodeId + ' where relation=? and ' +
  (inverse ? 'id2' : 'id1') + '=?'
  params.db.all(sql, [r, params.parent], (err, rows) => {
    if (err) params.callback(err)
    else {
      let values
      if (rows.length === 0) {
        sql = 'INSERT into relation_' + nodeId +
        '(relation,id1,id2,t1,t2,node) values (?,?,?,?,?,?)'
        values = [r, inverse ? relatedId : params.parent,
          inverse ? params.parent : relatedId,
          CT.START_OF_TIME, CT.END_OF_TIME, nodeId]
      } else {
        if (rows[0].id !== relatedId) {
          sql = 'UPDATE relation_' + nodeId + ' set ' +
          (inverse ? 'id1' : 'id2') + '=? where relation=? and ' +
          (inverse ? 'id2' : 'id1') + '=?'
          values = [relatedId, r, params.parent]
        }
      }
      if (values) {
        logger.trace(sql)
        logger.trace(values)
        params.db.run(sql, values, (err) => {
          params.callback(err)
        })
      } else params.callback() // No modification needed
    }
  })
}

const putCompleteProperty = (definition, params) => {
}

const putCompleteRelation = (definition, params) => {
}

/*
Does a subquery for every element of rows,
and puts the result as a property of the row.
*/
const processRow = (db, rows, i, subqueries, j, callback) => {
  if (i >= rows.length) callback(null, rows)
  else if (j >= subqueries.length) {
    delete rows[i]._id_
    processRow(db, rows, i + 1, subqueries, 0, callback)
  } else if (rows[i]._id_) {
    var s = subqueries[j]
    var select = getSimpleFields(s)
    var sq = getSubqueries(s)
    var sql = getSubselect(s._relation_, s._type_, select)
    if (s._relation_ && select && select.complete && !sq) {
      logger.trace('change to:')
      sql = 'select r.*,' + select.complete +
      ' from (' + sql + ') r left join entity_' + nodeId + ' on r._id_=entity_' + nodeId + '.id' +
      (s._filter_ ? ' where ' + s._filter_ + '' : '')// TODO: more flexible filter: for relation, for entity...
    }
    let values = [s._type_, rows[i]._id_]
    logger.trace(sql)
    logger.trace(values)
    db.all(sql, values, function (err, rowSubquery) {
      if (err) callback(err)
      else {
        if (rowSubquery.length > 0) {
          if (s._relation_) processRelation(s, select, rows[i], rowSubquery)
          else processProperty(s, select, rows[i], rowSubquery)
        }
        processRow(db, rows, i, subqueries, j + 1, callback)
      }
    })
  } else processRow(db, rows, i + 1, subqueries, 0, callback) // strange case, when join returns multiple rows
}

/*
Builds a simple query over the related property or relation, from an entity.
-relation: Relation type. <- or -> depending on direction. null if it's
not a relation, but a property.
-type: Relation or property name. Necessary to know property data type.
-select: Select structure, with the columns to take.
*/
const getSubselect = (relation, type, select) => {
  switch (relation) {
    case '->': return 'select id2 _id_,node _node_' +
    (select && select.complete_relation ? ',' + select.complete_relation : '') +
    ' from relation_' + nodeId + ' where relation=? and id1=?'
    case '<-': return 'select id1 _id_' +
    (select && select.complete_relation ? ',' + select.complete_relation : '') +
    ' from relation_' + nodeId + ' where relation=? and id2=?'
    default: return 'select ' + (select ? select.complete : 'value') +
    ' from property_' + MODEL.getTypeProperty(type) + '_' + nodeId +
    ' where property=? and entity=?'
  }
}

/*
Puts the result of a property subquery into the parent row.
*/
const processProperty = (subquery, select, row, rowSubquery) => {
  if (subquery._isArray_) {
    if (select) {
      for (let i = 0; i < rowSubquery.length; i++) cleanRow(rowSubquery[i])
      row[subquery._entry_name_] = rowSubquery
    } else {
      var l = []
      for (var k = 0; k < rowSubquery.length; k++) l.push(rowSubquery[k].value)
      row[subquery._entry_name_] = l
    }
  } else if (rowSubquery[0].value) row[subquery._entry_name_] = rowSubquery[0].value
}

/*
Deletes fields which should be hidden
*/
const cleanRow = (row) => {
  for (var k in row) {
    if (row.hasOwnProperty(k) &&
    (row[k] == null || row[k] === CT.START_OF_TIME ||
    row[k] === CT.END_OF_TIME)) delete row[k]
  }
}

/*
Puts the result of a relation subquery into the parent row, deleting, if necessary,
the phantom _id_ property of the row.
*/
const processRelation = (s, select, row, rowSubquery) => {
  if (s._isArray_) {
    var l = []
    if (select) {
      if (select.names === '_field_') {
        for (let k = 0; k < rowSubquery.length; k++) l.push(rowSubquery[k]._field_)
        row[s._entry_name_] = l
      } else {
        for (let k = 0; k < rowSubquery.length; k++) {
          delete rowSubquery[k]._id_
          cleanRow(rowSubquery[k])
        }
        row[s._entry_name_] = rowSubquery
      }
    } else {
      for (let k = 0; k < rowSubquery.length; k++) l.push(rowSubquery[k]._id_)
      row[s._entry_name_] = l
    }
  } else {
    if (select) {
      if (select.names === '_field_') {
        row[s._entry_name_] = rowSubquery[0]._field_
      } else {
        delete rowSubquery[0]._id_
        row[s._entry_name_] = rowSubquery[0]
      }
    } else row[s._entry_name_] = rowSubquery[0]._id_
  }
}

/*
Initialize and returns a definition structure of the str query, which contains:
-what: entity, property or relation
-type: Type of the "what" thing
-isArray: true if query must return and array
*/
const getDefinition = (str) => {
  var d = {what: 'entity', isArray: false}
  if (str._relation_) {
    d.what = 'relation'
    d.type = str._relation_
  } else if (str._property_) {
    d.what = 'property'
    d.type = str._property_
  } else if (str._entity_) {
    d.type = str._entity_
  }
  if (d.type && d.type.charAt(0) === '[') {
    d.isArray = true
    d.type = d.type.substring(1, d.type.length - 1)
  }
  return d
}

/*
Returns a filter from the structured query (str).
*/
const getFilter = (str) => {
  if (str._filter_) return str._filter_
  else if (str._id_) return 'id=' + str._id_
}

/*
Searches for simple fields in structured query str.
A simple fiels is something that should be included in SELECT clause.
-prefix: If table has an alias, a prefix could be passed.

Return value (res) contains two strings:
-complete: Complete query select. For instance: name n, code c
-names: Final names to select: For instance: n,c
*/
const getSimpleFields = (str, prefix) => {
  if (str) {
    var res
    for (var property in str) {
      if (str.hasOwnProperty(property)) {
        if (property.charAt(0) === '_' && property !== '_field_') {
        } else if (typeof str[property] === 'string') {
          let p = (prefix ? prefix + '.' : '')
          if (!res) res = {}
          switch (str[property]) {
            case 'id1':case 'id2':case 't1':case 't2':
            case 'order':case 'node':
              if (res.complete_relation) {
                res.complete_relation += ',' + p + str[property] + ' ' + property
              } else res.complete_relation = p + str[property] + ' ' + property
              if (res.names_relation) res.names_relation += ',' + property
              else res.names_relation = property
              break
            default:
              if (res.complete) {
                res.complete += ',' + p + str[property] + ' ' + property
              } else res.complete = p + str[property] + ' ' + property
              if (res.names) res.names += ',' + property
              else res.names = property
          }
        }
      }
    }
    return res
  }
}

/*
Searches for values in a data object, matching with definition of str,
and returns an array for input/update operations.
*/
const getValues = (str, data) => {
  if (str) {
    var res = {fields: [], values: []}
    for (var property in str) {
      if (str.hasOwnProperty(property)) {
        if (property.charAt(0) === '_' && property !== '_field_') {
        } else if (typeof str[property] === 'string') {
          res.fields.push(str[property])
          // Date fields could need some processing
          if (str[property] === 't1' || str[property] === 't2') {
            res.values.push(data[property])
          } else res.values.push(data[property])
        }
      }
    }
    return res
  }
}

/*
Searches for data in str which leads to subqueries (relations and arrays
of properties).
If found any, creates the subquery and adds it to "res" array.
Finally, returs res.
*/
const getSubqueries = (str) => {
  if (str) {
    var res
    for (var property in str) {
      if (str.hasOwnProperty(property)) {
        if (property.charAt(0) === '_' && property !== '_subquery_') {
        } else if (typeof str[property] !== 'string') {
          var d = str[property]
          d._entry_name_ = property
          var w = d._relation_
          let p = d._property_
          // relation
          if (w) {
            if (w.charAt(0) === '[') {
              w = w.substring(1, w.length - 1)
              d._isArray_ = true
            }
            if (w.charAt(0) === '*') {
              w = w.substring(1, w.length)
              d._recursive_ = true
            } else if (w.charAt(w.length - 1) === '*') {
              w = w.substring(0, w.length - 1)
              d._recursive_ = true
            }
            if (w.charAt(0) === '<') {
              w = w.substring(2, w.length)
              d._relation_ = '<-'
            } else if (w.charAt(w.length - 1) === '>') {
              w = w.substring(0, w.length - 2)
              d._relation_ = '->'
            }
            d._type_ = w
            if (res) res.push(d)
            else res = [d]
          } else if (p.charAt(0) === '[') {
            // array of properties
            d._isArray_ = true
            d._type_ = p.substring(1, p.length - 1)
            if (res) res.push(d)
            else res = [d]
          }
        }
      }
    }
    return res
  }
}

/*
Searches for data in str which leads to internal statements (relations and properties).
If found any, creates the subquery and adds it to "res" array.
Finally, returs res.
*/
const getSubStatements = (str) => {
  if (str) {
    var res
    for (var property in str) {
      if (str.hasOwnProperty(property)) {
        if (property.charAt(0) === '_' && property !== '_subquery_') {
        } else if (typeof str[property] !== 'string') {
          var d = str[property]
          d._entry_name_ = property
          if (res) res.push(d)
          else res = [d]
        }
      }
    }
    return res
  }
}

/*
Build joins with property table, for the required properties.
-query: Basic query over entity
-str: Structured query
Return a complete SELECT with joins with the proper tables.
*/
const getPropertyFields = (query, str) => {
  if (str) {
    var res
    var i = 1
    for (var property in str) {
      if (str.hasOwnProperty(property)) {
        if (property.charAt(0) === '_') {
        } else if (typeof str[property] !== 'string') {
          var d = str[property]
          let p = d._property_
          // No relations, and only single properties
          if (p && p.charAt(0) !== '[') {
            var select = getSimpleFields(d)

            // If no detailed fields, we assume it is the "value"
            if (select == null) select = {names: property, complete: 'value ' + property}
            var names = select.names
            var complete = select.complete

            // t1 and t2 could be used for properties, as well as relations
            if (select.complete_names) complete += ',' + select.complete_names
            if (select.complete_relation) complete += ',' + select.complete_relation

            if (!res) res = query
            res = 'select sq' + i + '.*,' + names +
              ' from (' + res + ') sq' + i +
              ' left join (select entity _idp_,' + complete +
              ' from property_' + MODEL.getTypeProperty(p) + '_' + nodeId +
              " where property='" + p + "'" +
              (d._filter_ ? ' and (' + d._filter_ + ')' : '') +
              ') q' + i + ' on sq' + i + '._id_=q' + i + '._idp_'
            i++
          }
        }
      }
    }
    if (res) return res
    else return query
  }
}

const isEntityField = (name) => {
  return name === 'id' || name === 'name' || name === 'name2' ||
  name === 'code' || name === 'document' || name === 'intname'
}

module.exports = {

  structuredGet: structuredGet,
  structuredPut: structuredPut

}

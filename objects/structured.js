// -------------------------------------------------------------------------------------------
// Module for structured queries, using objects and a graph model.
// -------------------------------------------------------------------------------------------

const MODEL = require('./model')
const logger = require.main.require('./utils/log').getLogger('db')

var nodeId = 1

/*
Main visible function for getting data.
-db: Database
-str: Structure for query
-callback: Callback function
*/
const structuredGet = (db, str, callback) => {
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
  var query = 'SELECT id _id_,' + (select ? select.complete : '*') + ' FROM entity_' + nodeId
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
      if (subqueries) processRow(db, rows, 0, subqueries, 0, callback)
      else {
        for (var i = 0; i < rows.length; i++) delete rows[i]._id_
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
-db: Database
-data: Data to put
-str: Structure for query
-callback: Callback function
*/
const structuredPut = (db, data, str, callback) => {
  if (str._op_) {
/*    state_service.new_id(customer,function(err,newid){
      if (err) callback(err);
      else{}
    } */

    var op = str._op_
    if (op === 'put') {
      var query = 'SELECT count(*) n FROM entity_' + nodeId + ' where ' + str[str._key_] + '=?'
      db.all(query, [data[str._key_]], function (err, rows) {
        if (err) callback(err)
        else doPut(rows.n > 0 ? 'update' : 'insert', db, data, str, callback)
      })
    } else doPut(op, db, data, str, callback)
  } else callback(new Error('No operation defined'))
}

const doPut = (op, db, data, str, callback) => {
  var statement
  var select = getSimpleFields(str)
  var subqueries = getSubqueries(str)
  switch (op) {
    case 'insert':statement = 'INSERT INTO entity_' + nodeId + '() values ()'
      break
    case 'update':
      break
  }
  db.run(statement, [], function (err, result) {
    if (err) callback(err)
    else {
      if (subqueries) runInternalPuts(subqueries, 0, db, data, str, callback)
      else callback()
    }
  })
}

/*
When a put statement contains a list, run the proper statements for
every element.
*/
const runInternalPuts = (subqueries, i, db, data, str, callback) => {
  if (i >= subqueries.length) callback()
  structuredPut(db, data, str, function () {
    runInternalPuts(subqueries, i + 1, db, data, str, callback)
  })
}

/*
Does a subquery for every element of rows,
and puts the result as a property of the row.
*/
const processRow = (db, rows, i, subqueries, j, callback) => {
  logger.trace('process_row ' + i + ',' + j)
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
      sql = 'select r.*,' + select.complete +
      ' from (' + sql + ') r left join entity_' + nodeId + ' on r._id_=entity_' + nodeId + '.id' +
      (s._filter_ ? ' where ' + s._filter_ + '' : '')// TODO: more flexible filter: for relation, for entity...
    }
    logger.trace(sql)
    db.all(sql, [s._type_, rows[i]._id_], function (err, rowSubquery) {
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
    ' from property_' + MODEL.get_type_property(type) + '_' + nodeId +
    ' where property=? and entity=?'
  }
}

/*
Puts the result of a property subquery into the parent row.
*/
const processProperty = (subquery, select, row, rowSubquery) => {
  if (subquery._isArray_) {
    if (select) row[subquery._entry_name_] = rowSubquery
    else {
      var l = []
      for (var k = 0; k < rowSubquery.length; k++) l.push(rowSubquery[k].value)
      row[subquery._entry_name_] = l
    }
  } else row[subquery._entry_name_] = rowSubquery[0].value
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
        for (let k = 0; k < rowSubquery.length; k++) delete rowSubquery[k]._id_
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

When
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
        if (property.charAt(0) === '_') {} else if (typeof str[property] !== 'string') {
          var d = str[property]
          d._entry_name_ = property
          var w = d._what_
          // relation
          if (w.indexOf('->') >= 0 || w.indexOf('<-') >= 0) {
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
          } else if (d._what_.charAt(0) === '[') {
            // array of properties
            d._isArray_ = true
            d._type_ = w.substring(1, w.length - 1)
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
          // No relations, and only single properties
          if (d._what_.indexOf('->') < 0 &&
              d._what_.indexOf('<-') < 0 &&
              d._what_.charAt(0) !== '[') {
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
              ' from property_' + MODEL.getTypeProperty(d._what_) + '_' + nodeId +
              " where property='" + d._what_ + "'" +
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

module.exports = {

  structuredGet: structuredGet,
  structuredPut: structuredPut

}

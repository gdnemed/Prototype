// -------------------------------------------------------------------------------------------
// Module for structured database selects, using objects and a graph model.
// -------------------------------------------------------------------------------------------
const MODEL = require('./model')
const CT = require('../CT')
let log = require('../utils/log').getLogger('db')
const utils = require('../utils/utils')

const FROM_ENTITY = 1
const FROM_ID = 2
const FROM_INPUTS = 3
const FROM_PROPERTY = 4
const FROM_RELATION = 5

let nodeId = 1

/* Main query function.
- session: Lemuria session
- data: Data that came from API (body or query)
- squery: Structured query, which tells the program how to build the result

Returns an object (or array) following the description in squery. */
const get = (session, data, squery) => {
  return new Promise((resolve, reject) => {
    let guide = createGuide(squery)
    let db = getDB(session, squery, guide)
    let statement = getStatement(session, db, squery, guide, data)
    // Everything prepared, let's do the work
    statement.then((rows) => {
      processRows(session, squery, data, guide, rows, 0)
      .then(() => {
        // Return result. Ir can be an array or an object
        if (guide.isArray || guide.type === FROM_INPUTS) {
          resolve(processArray(rows))
        } else if (rows !== null && rows !== undefined && rows.length > 0) resolve(rows[0])
        else resolve({})
      })
    })
    .catch(reject)
  })
}

/* If an array of simple elements should be returned,
* pushes info up. */
const processArray = (rows) => {
  if (rows && rows.length > 0 && rows[0]._field_ !== undefined && rows[0] !== null) {
    for (let i = 0;i < rows.length; i++) {
      rows[i] = rows[i]._field_
    }
  }
  return rows
}

/* Gets de DB object from session. */
const getDB = (session, squery, guide) => {
  return session.dbs[squery._inputs_ ? 'inputs' + guide.period.substr(0, 4) : 'objects']
}

/* Creates the knex statement */
const getStatement = (session, db, squery, guide, data) => {
  // Let's get fields
  for (let property in squery) {
    if (squery.hasOwnProperty(property)) {
      processGuideField(guide, property, squery[property])
    }
  }
  let initialStatement = getInitialStatement(guide, db, session)
  // Additional conditions
  addFilter(db, initialStatement, squery._filter_, data)
  // Build statement with its joins, etc
  let statement = buildStatement(initialStatement, db, guide, session)
  setOrder(statement, data)
  let sql = statement.toSQL()
  log.trace(sql)
  return statement
}

/* Selects simple properties or directly related data (not arrays) */
const buildStatement = (statement, db, guide, session) => {
  for (let i = 0; i < guide.simpleProps.length; i++) {
    addSimpleProperty(statement, guide.simpleProps[i].real, guide.simpleProps[i].visual)
  }
  if (guide.properties.length === 0 && guide.simpleRels.length === 0) return statement
  else {
    let last = statement
    for (let i = 0; i < guide.properties.length; i++) {
      last = addProperty(last, session, guide, guide.properties[i].real,
        guide.properties[i].visual, guide.properties[i].fields, i, false)
    }
    for (let i = 0; i < guide.simpleRels.length; i++) {
      last = addSimpleRelation(last, session, guide, guide.simpleRels[i],
        guide.properties.length + i)
    }
    return db.from(last)
  }
}

/* First select over entity or inputs table */
const getInitialStatement = (guide, db, session) => {
  let statement
  switch (guide.type) {
    case FROM_ENTITY:statement = getEntityFromType(db, guide.value)
      break
    case FROM_ID:statement = getEntityFromId(db, guide.id)
      break
    case FROM_INPUTS:statement = getInputs(db, guide.value)
      break
    case FROM_PROPERTY:statement = getProperty(db, guide)
      break
    case FROM_RELATION:statement = getRelation(db, guide, session)
      break
  }
  // this is the first table in joins list
  return statement.as('t0')
}

/* Creates a guide object from the squery structure, which contains information about
* how the sentence should be created. Returns the guide, which contains:
* - type: Constant which says if it's a query over entities or over inputs, and if its id-based or type-based.
* - value: Ir its an entity query, entity type. Ir its an inputs query, period. If period is the current
*   period, then it is 'now'
* - id: If query refers to a single entity/input, its id.
* - isArray: true if return structure must be an array. False if it must be an object.
* - directFields: true if there are "direct" fields
*   (not hidden fields like _id_, _entity_, etc.) which map data from DB to object.
* - timeFields: Fields containing time values.
* - dateFields: Fields containing time values.
* - parseNeeded: Field which need to be parsed to JSON.
* - forward: In relation, is true if relation must assume _id_ as id1, to get id2, or otherwise.
* The rest of fields are described in processGuideField()
*/
const createGuide = (squery) => {
  let guide = {
    simpleProps: [],
    properties: [],
    simpleRels: [],
    histProps: [],
    relations: [],
    timeFields: [],
    dateFields: [],
    parseNeeded: [],
    isArray: false,
    directFields: false,
    type: FROM_ENTITY
  }
  // Type of query
  if (squery._inputs_) {
    guide.type = FROM_INPUTS
    guide.value = squery._inputs_
    if (squery._inputs_ === 'now') {
      guide.period = utils.momentNow().format('YYYYMM')
    } else guide.period = squery._inputs_
    guide.value = guide.period
  } else if (squery._entity_) {
    guide.type = FROM_ENTITY
    guide.value = squery._entity_
  } else if (squery._property_) {
    guide.type = FROM_PROPERTY
    guide.value = squery._property_
    guide.id = squery._id_
  } else if (squery._relation_) {
    guide.type = FROM_RELATION
    guide.value = squery._relation_
    guide.id = squery._id_
    guide.relationFields = []
    guide.entityFields = []
    let arrow = guide.value.indexOf('->')
    if (arrow >= 0) {
      guide.forward = true
    } else {
      guide.forward = false
      arrow = guide.value.indexOf('<-')
    }
    guide.value = guide.value.substring(0, arrow) + guide.value.substring(arrow + 2)
  } else if (squery._id_) {
    guide.type = FROM_ID
    guide.id = squery._id_
  }
  // Array or object
  if (guide.value && guide.value.charAt(0) === '[') {
    guide.isArray = true
    guide.value = guide.value.substring(1, guide.value.length - 1)
  }
  return guide
}

/* Fills guide with lists of related data:
 * - simpleProps: Simple properties, located in entity/inputs table.
 * - properties: Property located in property_<type>_<node> table, but not historified.
 * - simpleRels: Relations which are not a list, that is, only one object is related and it is not historified.
 * - histProps: Property located in property_<type>_<node> table, but historified (so it is a list).
 * - relations: List of related objects.
 * - withEntity: true if information from entity must be get.
 * - linkOwner: true if a subquery over entities must be done, with the owner of the input.
 */
const processGuideField = (guide, property, val) => {
  if (property.charAt(0) !== '_' || property === '_field_') {
    if (typeof val === 'string') {
      processSimpleField(guide, property, val)
    } else {
      // Related properties and objects
      if (val._property_) {
        if (val._property_.charAt(0) === '[') {
          guide.histProps.push({squery: val, visual: property})
        } else {
          let str = {real: val._property_, visual: property, fields: getDirectFields(val)}
          guide.properties.push(str)
        }
      } else if (val._relation_) {
        if (val._relation_.charAt(0) === '[') {
          guide.relations.push({squery: val, visual: property})
        } else if (val._relation_ === 'owner') {
          // Input owner
          processSimpleField(guide, '_owner_', 'owner')
          let cloned = JSON.parse(JSON.stringify(val))
          delete cloned._relation_
          guide.linkOwner = {squery: cloned, visual: property}
        } else {
          let r = val._relation_
          let rel = {visual: property}
          getRelationFields(val, rel)
          if (guide.type === FROM_INPUTS) {
            rel.forward = true
            rel.relation = r
          } else if (r.indexOf('->') >= 0) {
            rel.forward = true
            rel.relation = r.substring(0, r.length - 2)
          } else {
            rel.forward = false
            rel.relation = r.substring(2)
          }
          guide.simpleRels.push(rel)
        }
      }
    }
  }
}

/* User fields (visible) treatment */
const processSimpleField = (guide, property, val) => {
  let f = {real: val, visual: property}
  // basic fields treatment
  guide.simpleProps.push(f)
  guide.directFields = true
  switch (val) {
    case 'intname': guide.parseNeeded.push(property)
      break
    case 't1': case 't2':
      let time
      if (guide.type === FROM_RELATION) {
        let r = MODEL.RELATIONS[guide.value]
        time = r.time
        guide.relationFields.push(f)
      } else {
        let r = MODEL.PROPERTIES[guide.value]
        time = r.time
      }
      if (time) guide.timeFields.push(property)
      else guide.dateFields.push(property)
      break
    default:
      if (guide.type === FROM_RELATION) {
        guide.entityFields.push(f)
      }
  }
}

/* Orders the statement */
const setOrder = (statement, variables) => {
  if (variables.order) {
    if (statement.orderBy) {
      statement.orderBy(variables.order, variables.desc ? 'desc' : 'asc')
    } else {
      statement.sql += ' order by ' + variables.order + (variables.desc ? ' desc' : ' asc')
    }
    // Remove order for recursiva get's
    delete variables.order
  }
}

/* Extracts every direct field from structure and puts it in an array with {field: name} elements */
const getDirectFields = (str) => {
  let a = []
  for (let property in str) {
    if (str.hasOwnProperty(property)) {
      if (property.charAt(0) !== '_') {
        a.push({field: str[property], visible: property})
      }
    }
  }
  return a
}

/* Extracts relation and entity fields from str and puts them on proper list. */
const getRelationFields = (str, relation) => {
  for (let property in str) {
    if (str.hasOwnProperty(property)) {
      if (property.charAt(0) !== '_') {
        let f = {field: str[property], visible: property}
        switch (str[property]) {
          case 'name': case 'name2': case 'intname': case 'code': case 'document':
            if (!relation.entityFields) relation.entityFields = []
            relation.entityFields.push(f)
            break
          case 't1': case 't2':
            if (!relation.relationFields) relation.relationFields = []
            relation.relationFields.push(f)
            break
        }
      }
    }
  }
}

// ///// Basic queries for each type (entity by type, entity by id, property, etc.) ////// //

const getEntityFromType = (parent, type) => {
  let query = parent.from('entity_' + nodeId)
  query.column('id as _id_')
  query.where('type', type)
  return query
}

const getEntityFromId = (parent, id) => {
  let query = parent.from('entity_' + nodeId)
  query.column('id as _id_')
  if (typeof id === 'string') id = parseInt(id)
  query.where('id', id)
  return query
}

const getInputs = (parent, period) => {
  let query = parent.from(`input_${nodeId}_${period}`)
  query.column('id as _id_')
  return query
}

const getProperty = (parent, guide) => {
  let type = MODEL.getTypeProperty(guide.value)
  let table, link
  if (guide.type === FROM_PROPERTY) {
    table = `property_${type}_${nodeId}`
    link = 'entity'
  } else {
    table = `input_data_${type}_${nodeId}_${guide.period}`
    link = 'id'
  }
  let query = parent.from(table)
  if (typeof guide.id === 'string') guide.id = parseInt(guide.id)
  if (!guide.directFields) query.column('value as _field_')
  query.where(link, guide.id)
  query.where('property', guide.value)
  return query
}

const getRelation = (parent, guide, session) => {
  let rt = 'relation_' + nodeId
  let query = parent.from(rt)
  if (typeof guide.id === 'string') guide.id = parseInt(guide.id)
  let related = guide.forward ? 'id2' : 'id1'
  query.column(`${related} as _id_`)
  let rel = MODEL.RELATIONS[guide.value]
  selectFields(query, guide.relationFields, rel.time, guide)
  query.where(guide.forward ? 'id1' : 'id2', guide.id)
  query.whereIn('relation', [guide.value])
  // If there are fields of the related entity, join it
  if (guide.entityFields) {
    let et = 'entity_' + nodeId
    query.join(et, 'id', related)
    selectFields(query, guide.entityFields, rel.time, guide)
  }
  return query
}

// ///////////////////////////////////////////////////// //

/* Adds a 'where' condition */
const addFilter = (db, statement, f, data) => {
  if (f) {
    let value
    if (f.variable) value = data[f.variable]
    else if (f.value !== null && f.value !== undefined) value = f.value
    if (f.field === 'id' && typeof value === 'string') value = parseInt(value)
    if (value !== null && value !== undefined) {
      switch (f.field) {
        case 'name':
        case 'name2':
        case 'intname':
        case 'code':
        case 'document':
        case 'id':
          if (f.condition) statement.where(f.field, f.condition, value)
          else statement.where(f.field, value)
          break
        default: // Condition over property
          let type = MODEL.getTypeProperty(f.field)
          let subquery = db(`property_${type}_${nodeId}`)
            .column('entity')
            .where('property', f.field)
          if (f.condition) subquery.where(f.field, f.condition, value)
          else subquery.where('value', value)
          statement.whereIn('id', subquery)
      }
    }
  }
}

const filterTime = (statement, withtime, session) => {
  statement
    .whereBetween('t1', withtime ? [CT.START_OF_TIME, session.now] : [CT.START_OF_DAYS, session.today])
    .whereBetween('t2', withtime ? [session.now, CT.END_OF_TIME] : [session.today, CT.END_OF_DAYS])
}

/* Adds a column to SELECT, which can be get directly from table */
const addSimpleProperty = (parent, real, visible) => {
  parent.column(real + ' as ' + visible)
  return parent
}

/* Adds a column to SELECT, which must be get from a join with 'property' */
const addProperty = (parent, session, guide, property, visible,
fields, index, mandatory) => {
  let lastTable = 't' + index
  let tableName = 't' + (index + 1)
  let type = MODEL.getTypeProperty(property)
  let prop = MODEL.PROPERTIES[property]
  let pt, link
  if (guide.type === FROM_ENTITY) {
    pt = `property_${type}_${nodeId}`
    link = 'p' + (index + 1) + '.entity'
  } else {
    pt = `input_data_${type}_${nodeId}_${guide.period}`
    link = 'p' + (index + 1) + '.id'
  }
  let propertyTable = sq => {
    sq.from(pt)
    sq.whereIn('property', [property])
    // Since we just want the current value, we must filter
    if (guide.type !== FROM_INPUTS) filterTime(sq, prop.time, session)
    sq.as('p' + (index + 1))
  }
  let newJoin = q => {
    q.from(parent)
    if (mandatory) q.join(propertyTable, link, '_id_')
    else q.leftJoin(propertyTable, link, '_id_')
    // Always get entity id and property value
    q.column(lastTable + '.*')
    // Rare, but possible: someone could want to get also dates
    if (fields.length > 0) selectFields(q, fields, prop.time, guide)
    else q.column('value as ' + visible)
    q.as(tableName)
  }
  return newJoin
}

/* Select fields from property or relation (usually t1 and t2)
* into query q. If t1 or t2 also updates guide.timeFields or guide.dateFields,
 * depending on time parameter. */
const selectFields = (q, fields, time, guide) => {
  if (fields) {
    for (let i = 0; i < fields.length; i++) {
      let f = fields[i].field
      if (f === 't1' || f === 't2') {
        if (time) guide.timeFields.push(fields[i].visible)
        else guide.dateFields.push(fields[i].visible)
      }
      q.column(f + ' as ' + fields[i].visible)
    }
  }
}

/* Adds columns to SELECT, which must be get from a join with 'relation' */
const addSimpleRelation = (parent, session, guide, relation, index) => {
  let lastTable = 't' + index
  let tableName = 't' + (index + 1)
  let rel = MODEL.RELATIONS[relation.relation]
  // Select over relation table
  let rt = sq => {
    sq.from('relation_' + nodeId)
    sq.whereIn('relation', [relation.relation])
    // Since we just want the current value, we must filter
    if (guide.type !== FROM_INPUTS) filterTime(sq, rel.time, session)
  }
  let related = relation.forward ? 'id2' : 'id1'
  // Join with relation table
  let relJoin = q => {
    q.from(parent)
    if (relation.mandatory) q.join(rt, relation.forward ? 'id1' : 'id2', '_id_')
    else q.leftJoin(rt, relation.forward ? 'id1' : 'id2', '_id_')
    // Always get entity id and last table vaules
    q.column(lastTable + '.*')
    q.column(related)
    // Specific fields from relation table
    selectFields(q, relation.relationFields, rel.time, guide)
    // If no specific data, just id
    if (!relation.relationFields && !relation.entityFields) q.column(related + ' as ' + relation.visual)
    // Alias
    if (relation.entityFields) q.as('r' + (index + 1))
    else q.as(tableName)
  }
  // If entity fields required, a new join must be done
  if (relation.entityFields) {
    let et = 'entity_' + nodeId
    let eJoin = q => {
      q.from(relJoin)
      q.leftJoin(et, related, et + '.id')
      q.column('r' + (index + 1) + '.*')
      selectFields(q, relation.entityFields, rel.time, guide)
      q.as(tableName)
    }
    return eJoin
  } else return relJoin
}

/* Makes recursive calls for every related array, that is, an historic property or a complete relation */
const includeRelatedArrays = (session, data, guide, row) => {
  return new Promise((resolve, reject) => {
    addHistProperty(session, data, guide.histProps, row, 0)
      .then(() => {
        addRelation(session, data, guide.relations, row, 0)
          .then(() => linkOwner(session, guide, data, row))
          .then(resolve)
          .catch(reject)
      })
      .catch(reject)
  })
}

/* Does a subquery over entity, with the owner property */
const linkOwner = (session, guide, data, row) => {
  return new Promise((resolve, reject) => {
    if (guide.linkOwner) {
      if (row._owner_ !== null && row._owner_ !== undefined) {
// Link previous entity with query
        guide.linkOwner.squery._id_ = row._owner_
        get(session, data, guide.linkOwner.squery)
          .then((result) => {
            // change hidden field _owner_ with result
            delete row._owner_
            if (result) {
              if (result._field_ !== null && result._field_ !== undefined) {
                row[guide.linkOwner.visual] = result._field_
              } else row[guide.linkOwner.visual] = result
            }
            resolve()
          })
          .catch(reject)
      } else {
        delete row._owner_
        resolve()
      }
    } else resolve()
  })
}

/* Calls get, from current id to include an historic property into row.
 - list: List of historic properties
 - n: Index into the list
 - row: parent row
 *  */
const addHistProperty = (session, data, list, row, n) => {
  return new Promise((resolve, reject) => {
    if (n >= list.length) resolve()
    else {
      let e = list[n]
      // Link previous entity with query
      e.squery._id_ = row._id_
      get(session, data, e.squery)
        .then((result) => {
          row[e.visual] = result
          addHistProperty(session, data, list, row, n + 1)
            .then(resolve).catch(reject)
        })
        .catch(reject)
    }
  })
}

/* Calls get, from current id to include a complete relation into row */
const addRelation = (session, data, list, row, n) => {
  return new Promise((resolve, reject) => {
    if (n >= list.length) resolve()
    else {
      let e = list[n]
      // Link previous entity with query
      e.squery._id_ = row._id_
      get(session, data, e.squery)
        .then((result) => {
          row[e.visual] = result
          addRelation(session, data, list, row, n + 1)
            .then(resolve).catch(reject)
        })
        .catch(reject)
    }
  })
}

const processRows = (session, squery, data, guide, rows, n) => {
  return new Promise((resolve, reject) => {
    if (n >= rows.length) resolve()
    else {
      // Now, for every row, call recursive queries and clean row from hidden fields
      includeRelatedArrays(session, data, guide, rows[n])
        .then(() => cleanResult(rows[n], squery, guide))
        .then(() => processRows(session, squery, data, guide, rows, n + 1))
        .then(resolve).catch(reject)
    }
  })
}

/* Deletes hidden fields (_id_, etc.) or fields which have 'null' values or equivalent */
const cleanResult = (row, squery, guide) => {
  if (row._id_) delete row._id_
  // If it's a property or relation simple history, push content to array
  if (!guide.directFields && (guide._property_ || guide._relation_)) {
    row = row._field_
  }
  // Every time or date field with extreme value should be hidden
  for (let j = 0; j < guide.timeFields.length; j++) {
    let f = guide.timeFields[j]
    if (row[f] === CT.START_OF_TIME || row[f] === CT.END_OF_TIME) delete row[f]
  }
  for (let j = 0; j < guide.dateFields.length; j++) {
    let f = guide.dateFields[j]
    if (row[f] === CT.START_OF_DAYS || row[f] === CT.END_OF_DAYS) delete row[f]
  }
  for (let p in row) {
    if (row.hasOwnProperty(p)) {
      if (row[p] === null || row[p] === undefined) delete row[p]
    }
  }
  let r = guide.parseNeeded
  for (let j = 0; j < r.length; j++) {
    if (row[r[j]] !== undefined && row[r[j]] !== null) {
      row[r[j]] = JSON.parse(row[r[j]])
    }
  }
  // Post transformations
  if (squery._transform_) squery._transform_(row)
  return Promise.resolve()
}

module.exports = {
  get
}

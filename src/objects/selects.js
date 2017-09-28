// -------------------------------------------------------------------------------------------
// Module for structured database selects, using objects and a graph model.
// -------------------------------------------------------------------------------------------

const FROM_ENTITY = 1
const FROM_ID = 2
const FROM_INPUTS = 3

let nodeId = 1

/* Main query function.
- session: Lemuria session
- data: Data that came from API (body or query)
- squery: Structured query, which tells the program how to build the result

Returns an object (or array) following the description in squery. */
const get = (session, data, squery) => {
  return new Promise((resolve, reject) => {
    let db = getDB(session, squery)
    let guide = createGuide(squery)
    let statement = getStatement(db, squery, guide, data)
    // Everything prepared, let's do the work
    statement.then((rows) => {
      includeRelatedArrays(guide)
      cleanResult(rows)
      resolve(rows)
    })
    .catch(reject)
  })
}

/* Gets de DB object from session. */
const getDB = (session, squery) => {
  return session.dbs[squery._inputs_ ? 'inputs' + squery._inputs_.substr(0, 4) : 'objects']
}

/* Creates the knex statement */
const getStatement = (db, squery, guide, data) => {
  let statement = getInitialStatement(guide, db)
  // Let's get fields
  for (let property in squery) {
    if (squery.hasOwnProperty(property)) {
      processGuideField(guide, property, squery[property])
    }
  }
  // Build statement with its joins, etc
  buildStatement(statement, guide)
  // Additional conditions
  addFilter(statement, squery._filter_, data)
  // If ordered, add order by
  if (squery._order_) {
    for (let i = 0; i < squery._order_.length; i++) {
      statement.orderBy(squery._order_[i].column, squery._order_[i].desc ? 'desc' : 'asc')
    }
  }
  return statement
}

/* Selects simple properties or directly related data (not arrays) */
const buildStatement = (statement, guide) => {
  for (let i = 0; i < guide.simpleProps; i++) {
    addSimpleProperty(statement, guide.simpleProps[i].real, guide.simpleProps[i].visual)
  }
  for (let i = 0; i < guide.properties; i++) {
    addProperty(statement, guide.properties[i].real, guide.properties[i].visual, i, false)
  }
  for (let i = 0; i < guide.simpleRels; i++) {
    addSimpleRelation(statement, guide.simpleRels[i], i, false)
  }
}

/* First select over entity or inputs table */
const getInitialStatement = (guide, db) => {
  switch (guide.type) {
    case FROM_ENTITY:return getEntityFromType(db, guide.value)
    case FROM_ID:return getEntityFromId(db, guide.value)
    case FROM_INPUTS:return getInputs(db, guide.value)
  }
}

/* Creates a guide object from the squery structure, which contains information about
* how the sentence should be created. Returns the guide, which contains:
* - type: Constant which says if it's a query over entities or over inputs, and if its id-based or type-based.
* - value: Ir its an entity query, entity type. Ir its an inputs query, period. If period is the current
* period, then it is 'now'
* - isArray: true if return structure must be an array. False if it must be an object.
* The rest of fields are described in processGuideField()
*/
const createGuide = (squery) => {
  let guide = {
    simpleProps: [],
    properties: [],
    simpleRels: [],
    histProps: [],
    relations: [],
    isArray: false,
    type: FROM_ENTITY
  }
  // Type of query
  if (squery._inputs_) {
    guide.type = FROM_INPUTS
    guide.value = squery._inputs_
  } else if (squery._id_) {
    guide.type = FROM_ID
    guide.value = squery._id_
  } else if (squery._entity_) {
    guide.type = FROM_ENTITY
    guide.value = squery._entity_
  }
  // Array or object
  if (guide.value.charAt(0) === '[') {
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
 */
const processGuideField = (statement, guide, property, val) => {
  if (property.charAt(0) !== '_') {
    if (typeof val === 'string') {
      guide.simpleProps.push({real: val, visual: property})
    } else {
      if (val._property_) {
        guide.properties.push({real: val._property_, visual: property})
      }
    }
  }
}

const getEntityFromType = (parent, type) => {
  let query = parent.from('entity_' + nodeId)
  query.column('id as _id_')
  query.where('type', type)
  return query
}

const getEntityFromId = (parent, id) => {
  let query = parent.from('entity_' + nodeId)
  query.column('id as _id_')
  query.where('id', parseInt(id))
  return query
}

const getInputs = (parent, id) => {
}

const addFilter = (statement, f, data) => {
  if (f) {
    let value = data[f.variable]
    if (value !== null && value !== undefined) filterByField(statement, f.field, value)
  }
}

const filterByField = (parent, field, value) => {
  return parent.where(field, value)
}

const addSimpleProperty = (parent, real, visible) => {
  parent.column(real + ' as ' + visible)
  return parent
}

const addProperty = (parent, property, visible, index, mandatory) => {
  let tableName = 'ps' + index
  let propertyTable = ''
  let newJoin = subquery => {
    subquery.from(parent)
    let on = table => {
      table.onIn(tableName + '.property', [property])
    }
    if (mandatory) subquery.join(propertyTable + ' as ' + tableName, on)
    else subquery.leftJoin(propertyTable + ' as ' + tableName, on)
  }
  newJoin.column('value as ' + visible)
  return newJoin
}

const addSimpleRelation = (statement, relation, i, mandatory) => {
}

const includeRelatedArrays = (guide, row) => {
  for (let i = 0; i < guide.histProps; i++) {
    addHistProperty(row, guide.histProps[i].guide, guide.histProps[i].visual)
  }
  for (let i = 0; i < guide.relations; i++) {
    addRelation(row, guide.relations[i].guide, guide.relations[i].visual)
  }
}

const addHistProperty = (row, guide, entry) => {
}

const addRelation = (row, guide, entry) => {
}

const cleanResult = (rows) => {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]._id_) delete rows._id_
  }
}

module.exports = {
  get
}

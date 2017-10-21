// -------------------------------------------------------------------------------------------
// Module for database updates, over properties and relations.
// -------------------------------------------------------------------------------------------
const MODEL = require('./model')
const CT = require('../CT')
const utils = require('../utils/utils')

let nodeId = 1

/* Generic put for properties */
const putProperty = (session, stateService, variables, squery, data, extraFunction) => {
  return new Promise((resolve, reject) => {
    let isArray = false
    let property = squery._property_
    if (property.charAt(0) === '[') {
      isArray = true
      property = property.substring(1, property.length - 1)
    }
    let modelProperty = MODEL.PROPERTIES[property]
    if (!modelProperty) {
      reject(new Error(`${property} property does not exist`))
      return
    }
    let propDataList = isArray ? data : [data]
    if (squery._total_) prepareTotalHistoric(propDataList, modelProperty.time)
    let parent = variables._parent_
    putElemProperty(session, property, modelProperty, squery, parent, propDataList, 0)
      .then(resolve).catch(reject)
  })
}

/* Puts a property in history */
const putElemProperty = (session, property, modelProperty, squery, parent, l, n) => {
  return new Promise((resolve, reject) => {
    if (n >= l.length) resolve()
    else {
      let elem = l[n]
      let isEntity = parent.entity
      let period = parent.period
      let id = parent.id
      let r = getObjectProperty(modelProperty, property, squery, elem, isEntity, id)
      // First, we select the complete history of property, for proper update
      let db = session.dbs[isEntity ? 'objects' : 'inputs' + Math.trunc(period / 100)]
      let typeProp = MODEL.getType(modelProperty.type)
      // get table
      let table = isEntity ? `property_${typeProp}_${nodeId}`
        : `input_data_${typeProp}_${nodeId}_${period}`
      // select
      let s = db.from(table).where(isEntity ? 'entity' : 'id', id).where('property', property)
      // If mixed update, change only historic for a value
      if (squery._mixed_) s.where('value', r.value)
      s.then((rows) => {
        if (isEntity) {
          // Entity's properties
          historicModifier(rows, r, table, db)
            .then(() => putElemProperty(session, property, modelProperty, squery, parent, l, n + 1))
            .then(resolve).catch(reject)
        } else {
          // Inputs properties
          let sentence
          if (rows.length === 0) sentence = db(table).insert(r)
          else sentence = db(table).where('id', id).where('property', property).update(r)
          sentence
            .then(() => putElemProperty(session, property, modelProperty, squery, parent, l, n + 1))
            .then(resolve).catch(reject)
        }
      })
      .catch(reject)
    }
  })
}

const getObjectProperty = (modelProperty, property, squery, elem, isEntity, id) => {
  let r = {property: property}
  for (let p in squery) {
    if (squery.hasOwnProperty(p)) {
      if (squery[p] === 't1') {
        if (squery[p]) r.t1 = typeof elem[p] === 'string' ? parseInt(elem[p]) : elem[p]
      } else if (squery[p] === 't2') {
        if (squery[p]) r.t2 = typeof elem[p] === 'string' ? parseInt(elem[p]) : elem[p]
      } else if (squery[p] === 'value') r.value = elem[p]
    }
  }
  if (typeof elem === 'string' || typeof elem === 'number') r.value = elem
  // For entities (not inputs), time counts
  if (isEntity) {
    r.entity = id
    if (!r.t1) r.t1 = modelProperty.time ? CT.START_OF_TIME : CT.START_OF_DAYS
    if (!r.t2) r.t2 = modelProperty.time ? CT.END_OF_TIME : CT.END_OF_DAYS
  } else {
    // Input
    r.id = id
    // Avoid null properties in inputs
    if (elem === null || elem === undefined) return r
  }
  return r
}

/*
Modifies historical lists of a relation (rows), inserting the new element r.
 params.id contains the id of the entity to modify.
 - rows: Rows for this history in DB
 - r: Element to insert
 - table: Table in DB
 - db: Database
 - def: Definition from API
 */
const historicModifier = (rows, r, table, db) => {
  return new Promise((resolve, reject) => {
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
    if (doNothing) resolve()
    else if (mods.length > 0) {
      modifyHistoricEntry(db, table, mods, 0, false)
        .then(resolve).catch(reject)
    } else {
      // No mix with other entries: just insert
      db.insert(r).into(table)
        .then(resolve).catch(reject)
    }
  })
}

/*
Modifies a point in history of a property or relation.
*/
const modifyHistoricEntry = (db, table, mods, i, inserted) => {
  return new Promise((resolve, reject) => {
    if (i >= mods.length) resolve()
    else {
      // a.e is be database element and a.r new element coming from API
      let a = mods[i]
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
      let pr
      switch (a.type) {
        case 1:pr = mix1(db, differentValue, a, reg, table, mods, inserted, i)
          break
        case 2:pr = mix2(db, differentValue, a, reg, table, mods, inserted, i)
          break
        case 3:pr = mix3(db, differentValue, a, reg, regNew, table, mods, inserted, i)
          break
        case 4:pr = mix4(db, differentValue, a, reg, regNew, table, mods, inserted, i)
          break
      }
      pr.then(resolve).catch(reject)
    }
  })
}

// /////////////// Historic modification cases /////////////////// //

// New into last
const mix1 = (db, differentValue, a, reg, table, mods, inserted, i) => {
  return new Promise((resolve, reject) => {
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
            if (a.r.remove) {
              return modifyHistoricEntry(db, table, mods, i + 1, inserted)
            } else {
              db.insert(a.r).into(table)
                .then(() => modifyHistoricEntry(db, table, mods, i + 1, inserted))
            }
          })
            .then(resolve).catch(reject)
        })
        .then(resolve).catch(reject)
    } else {
      modifyHistoricEntry(db, table, mods, i + 1, inserted)
        .then(resolve).catch(reject)
    }
  })
}

// Last into new. Simply override
const mix2 = (db, differentValue, a, reg, table, mods, inserted, i) => {
  return new Promise((resolve, reject) => {
    let s
    if (inserted || a.r.remove) s = reg.delete()
    else s = reg.update(a.r)
    s.then((count) => modifyHistoricEntry(db, table, mods, i + 1, true))
      .then(resolve).catch(reject)
  })
}

// New contains left limit
const mix3 = (db, differentValue, a, reg, regNew, table, mods, inserted, i) => {
  return new Promise((resolve, reject) => {
    if (differentValue && !a.r.remove) {
      a.e.t1 = utils.nextTime(a.r.t2)
      reg.update(a.e)
        .then((count) => {
          if (inserted) return Promise.resolve()
          else return db.insert(a.r).into(table)
        })
        .then(() => modifyHistoricEntry(db, table, mods, i + 1, true))
        .then(resolve)
        .catch(reject)
    } else {
      reg.delete()
        .then((count) => {
          if (a.r.remove) return Promise.resolve()
          else if (inserted) {
            a.r.t2 = a.e.t2
            // r was already inserted: delete db register and update r to new t2
            return regNew.update(a.r)
          } else {
            // r was not inserted, so insert it now
            return db.insert(a.r).into(table)
          }
        })
        .then(() => modifyHistoricEntry(db, table, mods, i + 1, a.r.remove || inserted))
        .then(resolve)
        .catch(reject)
    }
  })
}

// New contains right limit
const mix4 = (db, differentValue, a, reg, regNew, table, mods, inserted, i) => {
  return new Promise((resolve, reject) => {
    let pr
    if (differentValue && !a.r.remove) {
      a.e.t2 = utils.previousTime(a.r.t1)
      pr = reg.update(a.e)
        .then((count) => {
          if (inserted) return Promise.resolve()
          else return db.insert(a.r).into(table)
        })
    } else {
      pr = reg.delete()
        .then((count) => {
          if (a.r.remove) return Promise.resolve()
          else if (inserted) {
            a.r.t1 = a.e.t1
            // r was already inserted: delete db register and update r to new t2
            return regNew.update(a.r)
          } else {
            // r was not inserted, so insert it now
            return db.insert(a.r).into(table)
          }
        })
    }
    pr.then(() => modifyHistoricEntry(db, table, mods, i + 1, true))
      .then(resolve)
      .catch(reject)
  })
}

/* Generic creation/update for relations */
const putRelation = (session, stateService, variables,
squery, data, extraFunction) => {
  return new Promise((resolve, reject) => {
    let isArray = false
    let relationDef = squery._relation_
    if (relationDef.charAt(0) === '[') {
      isArray = true
      relationDef = relationDef.substring(1, relationDef.length - 1)
    }
    let relation, entity, forward
    let arrow = relationDef.indexOf('->')
    if (arrow >= 0) forward = true
    else {
      arrow = relationDef.indexOf('<-')
      if (arrow >= 0) forward = false
      else {
        reject(new Error(`Relation syntax error: ${relationDef}`))
        return
      }
    }
    relation = relationDef.substring(0, arrow)
    entity = relationDef.substring(arrow + 2)
    let modelRelation = MODEL.RELATIONS[relation]
    if (!modelRelation) {
      reject(new Error(`${relation} relation does not exist`))
      return
    }
    let newStr = {_entity_: entity}
    let relDataList = isArray ? data : [data]
    if (squery._total_) prepareTotalHistoric(relDataList, modelRelation.time)
    let parent = variables._parent_
    putRelationItem(session, stateService, relDataList, 0,
newStr, squery, relation, modelRelation, forward, parent)
      .then(resolve).catch(reject)
  })
}

const putRelationItem = (session, stateService, relDataList, i,
newStr, relObj, relation, modelRelation, forward, parent) => {
  return new Promise((resolve, reject) => {
    if (i >= relDataList.length) resolve()
    else {
      putElemRelation(session, stateService, newStr, relObj,
relation, modelRelation, relDataList[i], forward, parent)
        .then(() => putRelationItem(session, stateService, relDataList, i + 1,
newStr, relObj, relation, modelRelation, forward, parent))
        .then(resolve).catch(reject)
    }
  })
}

/*
Treats every single element related with the main entity to put
*/
const putElemRelation = (session, stateService, newStr, relObj,
relation, modelRelation, relData, forward, parent) => {
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
    if (parent.entity) {
      if (!t1) t1 = modelRelation.time ? CT.START_OF_TIME : CT.START_OF_DAYS
      if (!t2) t2 = modelRelation.time ? CT.END_OF_TIME : CT.END_OF_DAYS
    }
    // Recursively call put
    parent.put(session, stateService, {}, newStr, relData, null)
      .then((id) => {
        let table
        let db = session.dbs['objects']
        let r
        if (parent.entity) { // Entities
          table = 'relation_1'
          r = {
            relation: relation,
            id1: forward ? parent.id : id,
            id2: forward ? id : parent.id,
            t1: t1,
            t2: t2,
            ord: 0,
            node: 1
          }
        } else { // Inputs
          table = 'input_rel_1_' + parent.period
          r = {
            relation: relation,
            id: parent.id,
            entity: id
          }
        }
        // Entity is there, now we can create the relation properly
        let s = db.from(table).where('relation', relation)
        if (parent.entity) s.where(forward ? 'id1' : 'id2', parent.id) // entity
        else s.where('id', parent.id) // input
        s.then((rows) => {
          if (parent.entity) {
            historicModifier(rows, r, table, db)
              .then(resolve).catch(reject)
          } else {
            // TODO: Inputs relations
            resolve()
          }
        })
          .catch(reject)
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

module.exports = {
  putProperty,
  putRelation
}

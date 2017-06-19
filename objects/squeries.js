// -------------------------------------------------------------------------------------------
// Module for structured queries, using objects and a graph model.
// -------------------------------------------------------------------------------------------

const MODEL = require('./model')

const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './db/SPEC/objects_1.db'
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
  if (!prepare(db, str, variables)) callback(new Error('Syntax error'))
  else execute(db, str, callback)
}

const prepare = (db, str, variables) => {
  str._guide_ = {entity_fields: {},
    property_fields: [],
    property_subqueries: {},
    relations_forward: [],
    relations_backward: []}

  let type = str._entity_ ? str._entity_
  : (str._property_ ? str._property_ : str._relation_)

  if (!type) return false

  if (type && type.charAt(0) === '[') {
    str._guide_.isArray = true
    type = type.substring(1, type.length - 1)
  } else str._guide_.isArray = false

  getFields(str)

  if (str._entity_) {
    let f = str._guide_.entity_fields
    // Always a hidden id of the entity
    str._guide_.fields_to_remove = ['_id_']

    // Select over ENTITY
    let e = sq => {
      let s = sq.from('entity_' + nodeId)
      s.column('id as _id_')
      for (var c in f) {
        if (f.hasOwnProperty(c)) s.column(c + ' as ' + f[c])
      }
      s.where('type', type).as('e')
    }
    // Properties JOIN
    let ps = str._guide_.property_fields
    if (ps) {
      for (let i = 0; i < ps.length; i++) {
        ps[i].stProperty = sq => {
          sq.from('property_' +
            MODEL.getTypeProperty(ps[i].type) + '_' + nodeId).as('pr' + i)
            .where('property', ps[i].type).as('pr' + i)
        }
        ps[i].join = sq => {
          let table = i === 0 ? 'e' : 'jpr' + (i - 1)
          sq.from(i === 0 ? e : ps[i - 1].join)
            .leftJoin(ps[i].stProperty, 'pr' + i + '.entity', table + '._id_')
            .column(table + '.*').column('pr' + i + '.value as ' + ps[i].entry)
            .as('jpr' + i)
        }
      }
      str._guide_.statement = db.from(ps[ps.length - 1].join)
    } else str._guide_.statement = db.from(e)
    console.log(str._guide_.statement.toSQL())
  }

  return true
}

const getFields = (str) => {
  for (var property in str) {
    if (str.hasOwnProperty(property)) {
      if (property.charAt(0) === '_' && property !== '_field_') {
      } else if (typeof str[property] === 'string') {
        str._guide_.entity_fields[str[property]] = property
      } else {
        // Properties or relations
        let f = {entry: property, type: str[property]._property_}
        if (f.type.charAt(0) === '[') {
          f.isArray = true
          f.type = f.type.substring(1, f.type.length - 1)
        }
        if (f.type.indexOf('->') >= 0) {
        } else if (f.type.indexOf('->') >= 0) {
        } else { // It's a property
          if (f.isArray) {
            let typeProperty = MODEL.getTypeProperty(f.type)
            if (!str._guide_.property_subqueries[typeProperty]) {
              str._guide_.property_subqueries[typeProperty] = {}
            }
            str._guide_.property_subqueries[typeProperty].push(f)
          } else str._guide_.property_fields.push(f)
          console.log(str._guide_)
        }
      }
    }
  }
}

const execute = (db, str, callback) => {
  str._guide_.statement.then((rows) => {
    let r = str._guide_.fields_to_remove
    if (r) {
      for (let i = 0; i < r.length; i++) {
        for (let j = 0; j < rows.length; j++) delete rows[j][r[i]]
      }
    }
    callback(null, rows)
  })
  .catch((err) => callback(err))
}

/* const select = (db, variables, str, callback) => {
  let s1 = db.select()
  let s2 = db.select()
  s1.column('code as codigo').column('document as dni')
  .from('entity_' + nodeId).where('id', 0)
  s1._statements[s1._statements.length - 1].value = 5
  s1.then((rows) => {
    console.log(rows)
    s1._statements[s1._statements.length - 1].value = 6
    s1.then((rows2) => {
      console.log(rows2)
      s2.from('entity_' + nodeId)
      .then((rows3) => {
        console.log(rows3)
        callback()
      })
    })
  })
  .catch((err) => console.log(err.message))
}

select(knex,{},{},(err) => {
  process.exit(0)
})*/

/*
let s1 = (sq => sq.from('entity').column('id as _id_').as('e'))
let s2 = (sq => sq.from('property').column('entity').column('value as language').as('p1'))
let s = knex.from(s1).leftJoin(s2,'e._id_','p1.entity')
console.log(s.toSQL())
*/


 get(knex, null, {_entity_: 'record',
  nombre: 'name',
  codigo: 'code',
  idioma: {_property_: 'language'},
  incidencias: {_property_: 'ttgroup'},
  validez: {_property_: 'validity'}},
(err, rows) => {
  if (err) console.log(err)
  else console.log(rows)
  process.exit(0)
})

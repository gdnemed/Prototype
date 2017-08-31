const fs = require('fs')

exports.up = (knex, Promise) => {
  let year = knex.schema.client.config.year
  return upMonthYear(knex, year, 1)
}

const upMonthYear = (knex, year, i) => {
  return new Promise((resolve, reject) => {
    if (i > 12) resolve()
    else {
      let month = year + (i < 10 ? '0' + i : i)
      exports.upMonth(knex, month)
        .then(() => {
          knex.client.config.months[month] = true
          return upMonthYear(knex, year, i + 1)
        })
        .then(resolve)
        .catch(reject)
    }
  })
}

const checkTable = (db, name, f) => {
  return db.schema.hasTable(name)
    .then((exists) => {
      if (!exists) return db.schema.createTableIfNotExists(name, f)
      else return Promise.resolve()
    })
    .catch((err) => Promise.reject(err))
}

exports.upMonth = (knex, month) => {
  const createTableInputs = () => checkTable(knex, 'input_1_' + month, (table) => {
    table.integer('id').primary()
    table.integer('tmp')
    table.integer('gmt') // TODO: veure table.timestamp
    table.integer('reception')
    table.integer('owner')
    table.integer('result')
    table.integer('source')
    table.string('serial')
    table.index(['id'], 'i_input_id_' + month)
    table.index(['tmp'], 'i_input_tmp_' + month)
    table.index(['serial', 'tmp'], 'i_input_stmp_' + month)
    table.index(['owner', 'tmp'], 'i_input_otmp_' + month)
  })
  const createTableStrInputs = () => checkTable(knex, 'input_data_str_1_' + month, (table) => {
    table.integer('id')
    table.string('property')
    table.string('value')
    table.index(['id', 'property'], 'i_input_s_' + month)
    table.index(['property', 'value'], 'i_input_spv_' + month)
  })
  // (id integer, property integer, value integer)
  const createTableNumInputs = () => checkTable(knex, 'input_data_num_1_' + month, (table) => {
    table.integer('id')
    table.string('property')
    table.integer('value')
    table.index(['id', 'property'], 'i_input_n_' + month)
  })
  // (id integer, property integer, value blob)
  const createTableBinInputs = () => checkTable(knex, 'input_data_bin_1_' + month, (table) => {
    table.integer('id')
    table.string('property')
    table.binary('value')
    table.index(['id', 'property'], 'i_input_b_' + month)
  })
  // (id integer, relation integer, entity integer)
  const createTableRelationInputs = () => checkTable(knex, 'input_rel_1_' + month, (table) => {
    table.integer('id')
    table.integer('relation')
    table.integer('entity')
    table.index(['relation', 'id'], 'i_input_r_' + month)
    table.index(['relation', 'entity'], 'i_input_rinv_' + month)
  })
  try {
    return createTableInputs()
      .then(createTableStrInputs)
      .then(createTableNumInputs)
      .then(createTableBinInputs)
      .then(createTableRelationInputs)
      .catch((err) => {
        return Promise.reject(err)
      })
  } catch (err) {
    console.log(err)
  }
}

exports.down = (knex, Promise) => {
  let year = knex.schema.client.config.year
  return downMonthYear(knex, year, 1)
}

const downMonthYear = (knex, year, i) => {
  return new Promise((resolve, reject) => {
    if (i > 12) resolve()
    else {
      exports.downMonth(knex, year + (i < 10 ? '0' + i : i))
        .then(() => downMonthYear(knex, year, i + 1))
        .then(resolve)
        .catch(reject)
    }
  })
}

exports.downMonth = (db, month) => {
  return new Promise((resolve, reject) => {
    let r = db.schema
    r.dropTableIfExists('input_1_' + month)
      .then(() => r.dropTableIfExists('input_data_str_1_' + month))
      .then(() => r.dropTableIfExists('input_data_num_1_' + month))
      .then(() => r.dropTableIfExists('input_data_bin_1_' + month))
      .then(() => r.dropTableIfExists('input_rel_1_' + month))
      .then(() => {
        delete db.client.config.months[month]
        let empty = true
        for (let key in db.client.config.months) {
          if (db.client.config.months.hasOwnProperty(key)) empty = false
        }
        // In sqlite, destroy connection and delete file when it's empty
        if (empty && db.client.config.client === 'sqlite3') {
          db.destroy(() => {
            setTimeout(() => fs.unlink(db.client.config.connection.filename, (err) => {
              if (err) console.log(err)
            }), 2000)
          })
        }
        resolve(empty)
      })
      .catch(reject)
  })
}

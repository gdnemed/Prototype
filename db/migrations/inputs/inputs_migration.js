exports.up = (knex, Promise) => {
  let year = knex.schema.client.config.year
  let r = knex.schema
  for (let i = 1; i <= 12; i++) {
    let month = year + (i < 10 ? '0' + i : i)
      // '(id integer, tmp integer, gmt integer, reception integer, ' +
      // 'owner integer, result integer, source integer, serial text)')
    r = r.createTable('input_1_' + month, (table) => {
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
    // (id integer, property integer, value text)',
    .createTable('input_data_str_1_' + month, (table) => {
      table.integer('id')
      table.string('property')
      table.string('value')
      table.index(['id', 'property'], 'i_input_s_' + month)
      table.index(['property', 'value'], 'i_input_spv_' + month)
    })
    // (id integer, property integer, value integer)
    .createTable('input_data_num_1_' + month, (table) => {
      table.integer('id')
      table.string('property')
      table.integer('value')
      table.index(['id', 'property'], 'i_input_n_' + month)
    })
    // (id integer, property integer, value blob)
    .createTable('input_data_bin_1_' + month, (table) => {
      table.integer('id')
      table.string('property')
      table.binary('value')
      table.index(['id', 'property'], 'i_input_b_' + month)
    })
    // (id integer, relation integer, entity integer)
    .createTable('input_rel_1_' + month, (table) => {
      table.integer('id')
      table.integer('relation')
      table.integer('entity')
      table.index(['relation', 'id'], 'i_input_r_' + month)
      table.index(['relation', 'entity'], 'i_input_rinv_' + month)
    })
  }
  return r
}

exports.down = (knex, Promise) => {
  let year = knex.schema.client.config.year
  let r = knex.schema
  return downMonthYear(r, year, 1)
}

const downMonthYear = (r, year, i) => {
  return new Promise((resolve, reject) => {
    if (i > 12) resolve()
    exports.downMonth(r, year + (i < 10 ? '0' + i : i))
      .then(() => downMonthYear(r, year, i + 1))
      .then(resolve)
      .catch(reject)
  })
}

exports.downMonth = (r, month) => {
  return new Promise((resolve, reject) => {
    r.dropTableIfExists('input_1_' + month)
      .then(() => r.dropTableIfExists('input_data_str_1_' + month))
      .then(() => r.dropTableIfExists('input_data_num_1_' + month))
      .then(() => r.dropTableIfExists('input_data_bin_1_' + month))
      .then(() => r.dropTableIfExists('input_rel_1_' + month))
      .then(() => resolve())
      .catch(reject)
  })
}

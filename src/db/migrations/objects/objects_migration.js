exports.up = (knex, Promise) => {
  let createIndex

  return knex.schema
  // TODO: include 'nodeId' & indexes
    .hasTable('entity_1', (exists) => {
      createIndex = !exists
    })
    .createTableIfNotExists('entity_1', (table) => {
      table.bigInteger('id').primary()
      table.string('type')
      table.string('name')
      table.string('name2')
      table.string('intname', 4000)
      table.string('document')
      table.string('code')
      if (createIndex) {
        table.index(['id'], 'id')
        table.index(['type', 'name'], 'i_tname')
        table.index(['type', 'name2'], 'i_tname2')
        table.index(['type', 'name', 'name2'], 'i_tnamec')
        table.index(['type', 'code'], 'i_tcode')
        table.index(['type', 'document'], 'i_tdocument')
      }
    })
    .hasTable('property_num_1', (exists) => {
      createIndex = !exists
    })
    .createTableIfNotExists('property_num_1', (table) => {
      table.bigInteger('entity')
      table.string('property')
      table.bigInteger('t1')
      table.bigInteger('t2')
      table.bigInteger('value')
      if (createIndex) {
        table.index(['property', 'entity', 't1', 't2'], 'i_pn_pe')
        table.index(['property', 'value', 't1', 't2'], 'i_pn_pv')
      }
    })
    .hasTable('property_str_1', (exists) => {
      createIndex = !exists
    })
    .createTableIfNotExists('property_str_1', (table) => {
      table.bigInteger('entity')
      table.string('property')
      table.bigInteger('t1')
      table.bigInteger('t2')
      table.string('value')
      if (createIndex) {
        table.index(['property', 'entity', 't1', 't2'], 'i_ps_pe')
        table.index(['property', 'value', 't1', 't2'], 'i_ps_pv')
      }
    })
    .hasTable('property_bin_1', (exists) => {
      createIndex = !exists
    })
    .createTableIfNotExists('property_bin_1', (table) => {
      table.bigInteger('entity')
      table.string('property')
      table.bigInteger('t1')
      table.bigInteger('t2')
      table.binary('value')
      if (createIndex) {
        table.index(['property', 'entity', 't1', 't2'], 'i_pb_pe')
      }
    })
    .hasTable('relation_1', (exists) => {
      createIndex = !exists
    })
    .createTableIfNotExists('relation_1', (table) => {
      table.string('relation')
      table.bigInteger('id1')
      table.bigInteger('id2')
      table.bigInteger('t1')
      table.bigInteger('t2')
      table.bigInteger('ord')
      table.bigInteger('node')
      if (createIndex) {
        table.index(['relation', 'id1'], 'i_r1')
        table.index(['relation', 'id2'], 'i_r2')
      }
    })
}

exports.down = function (knex, Promise) {
  return knex.schema
    .dropTableIfExists('entity_1')
    .dropTableIfExists('property_num_1')
    .dropTableIfExists('property_str_1')
    .dropTableIfExists('property_bin_1')
    .dropTableIfExists('relation_1')
}

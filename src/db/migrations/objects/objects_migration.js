exports.up = (knex, Promise) => {
  return knex.schema
  // TODO: include 'nodeId' & indexes
    .createTable('entity_1', (table) => {
      table.integer('id').primary()
      table.string('type')
      table.string('name')
      table.string('name2')
      table.string('intname')
      table.string('document')
      table.string('code')
      table.index(['id'], 'id')
      table.index(['type', 'name'], 'i_tname')
      table.index(['type', 'name2'], 'i_tname2')
      table.index(['type', 'name', 'name2'], 'i_tnamec')
      table.index(['type', 'code'], 'i_tcode')
      table.index(['type', 'document'], 'i_tdocument')
    })
    .createTable('property_num_1', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.integer('value')
      table.index(['property', 'entity', 't1', 't2'], 'i_pn_pe')
      table.index(['property', 'value', 't1', 't2'], 'i_pn_pv')
    })
    .createTable('property_str_1', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.string('value')
      table.index(['property', 'entity', 't1', 't2'], 'i_ps_pe')
      table.index(['property', 'value', 't1', 't2'], 'i_ps_pv')
    })
    .createTable('property_bin_1', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.binary('value')
      table.index(['property', 'entity', 't1', 't2'], 'i_pb_pe')
    })
    .createTable('relation_1', (table) => {
      table.string('relation')
      table.integer('id1')
      table.integer('id2')
      table.integer('t1')
      table.integer('t2')
      table.integer('ord')
      table.integer('node')
      table.index(['relation', 'id1'], 'i_r1')
      table.index(['relation', 'id2'], 'i_r2')
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

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
    })
    .createTable('property_num_1', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.integer('value')
    })
    .createTable('property_str_1', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.string('value')
    })
    .createTable('property_bin_1', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.binary('value')
    })
    .createTable('relation_1', (table) => {
      table.string('relation')
      table.integer('id1')
      table.integer('id2')
      table.integer('t1')
      table.integer('t2')
      table.integer('ord')
      table.integer('node')
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

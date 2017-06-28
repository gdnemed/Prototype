exports.up = (knex, Promise) => {
  return knex.schema
  // TODO: include 'nodeId' & indexes
    .createTable('entity_', (table) => {
      table.integer('id').primary()
      table.string('type')
      table.string('name')
      table.string('name2')
      table.string('intname')
      table.string('document')
      table.string('code')
    })
    .createTable('property_num_', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.integer('value')
    })
    .createTable('property_str_', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.string('value')
    })
    .createTable('property_bin_', (table) => {
      table.integer('entity')
      table.string('property')
      table.integer('t1')
      table.integer('t2')
      table.binary('value')
    })
    .createTable('relation_', (table) => {
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
    .dropTableIfExists('entity_')
    .dropTableIfExists('property_num_')
    .dropTableIfExists('property_str_')
    .dropTableIfExists('property_bin_')
    .dropTableIfExists('relation_')
}

exports.up = (knex, Promise) => {
  return knex.schema
  // TODO: include 'nodeId' & indexes & date (for sharding?...)
  // '(id integer, tmp integer, gmt integer, reception integer, ' +
  // 'owner integer, result integer, source integer, serial text)')
    .createTable('input_1', (table) => {
      table.integer('id').primary()
      table.integer('tmp')
      table.integer('gmt') //TODO: veure table.timestamp
      table.integer('reception')
      table.integer('owner')
      table.integer('result')
      table.integer('source')
      table.string('serial')
    })
    // (id integer, property integer, value text)',
    .createTable('input_data_str_1', (table) => {
      table.integer('id')
      table.integer('property')
      table.string('text')
    })
    // (id integer, property integer, value integer)
    .createTable('input_data_num_1', (table) => {
      table.integer('id')
      table.integer('property')
      table.integer('value')
    })
    // (id integer, property integer, value blob)
    .createTable('input_data_bin_1', (table) => {
      table.integer('id')
      table.integer('property')
      table.binary('value')
    })
    // (id integer, relation integer, entity integer)
    .createTable('input_rel_1', (table) => {
      table.integer('id')
      table.integer('relation')
      table.integer('entity')
    })
    // (id integer, relation integer, entity integer)
    // TODO: falta un "seed" que injecta el valor (1)
    .createTable('local_id', (table) => {
      table.integer('id')
    })
}

exports.down = function (knex, Promise) {
  return knex.schema
    .dropTableIfExists('input_1')
    .dropTableIfExists('input_data_str_1')
    .dropTableIfExists('input_data_num_1')
    .dropTableIfExists('input_data_bin_1')
    .dropTableIfExists('input_rel_1')
    .dropTableIfExists('local_id')
}

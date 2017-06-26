exports.up = function (knex) {
  return knex.schema
    .createTable('settings', (table) => {
      table.increments('id').primary()
      table.string('var')
      table.string('code')
    })
    .createTable('global_id', (table) => {
      table.increments('id').primary()
    })
}

exports.down = (knex) => {
  return knex.schema
    .dropTableIfExists('settings')
    .dropTableIfExists('global_id')
}

exports.up = function (knex) {
  return knex.schema
    .createTable('settings', (table) => {
      table.string('var')
      table.string('code')
    })
    .createTable('global_id', (table) => {
      table.integer('id').primary()
    })
}

exports.down = (knex) => {
  return knex.schema
    .dropTableIfExists('settings')
    .dropTableIfExists('global_id')
}

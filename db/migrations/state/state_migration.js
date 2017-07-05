exports.up = function (knex) {
  return knex.schema
    .createTable('settings', (table) => {
      table.string('var')
      table.string('code')
    })
}

exports.down = (knex) => {
  return knex.schema
    .dropTableIfExists('settings')
}

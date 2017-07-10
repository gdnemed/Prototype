exports.up = function (knex) {
  return knex.schema
    .createTable('settings', (table) => {
      table.string('setting')
      table.string('value')
      table.index(['setting'], 'i_setting')
    })
}

exports.down = (knex) => {
  return knex.schema
    .dropTableIfExists('settings')
}

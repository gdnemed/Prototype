exports.up = function (knex) {
  let createIndex

  return knex.schema
    .hasTable('settings', (exists) => {
      createIndex = !exists
    })
    .createTableIfNotExists('settings', (table) => {
      table.string('setting')
      table.string('value')
      if (createIndex) table.index(['setting'], 'i_setting')
    })
}

exports.down = (knex) => {
  return knex.schema
    .dropTableIfExists('settings')
}

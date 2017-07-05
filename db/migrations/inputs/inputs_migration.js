exports.up = (knex, Promise) => {
  let month = 201707
  return knex.schema
  // TODO: include 'nodeId' & indexes & date (for sharding?...)
  // '(id integer, tmp integer, gmt integer, reception integer, ' +
  // 'owner integer, result integer, source integer, serial text)')
    .createTable('input_1_' + month, (table) => {
      table.integer('id').primary()
      table.integer('tmp')
      table.integer('gmt') // TODO: veure table.timestamp
      table.integer('reception')
      table.integer('owner')
      table.integer('result')
      table.integer('source')
      table.string('serial')
    })
    // (id integer, property integer, value text)',
    .createTable('input_data_str_1_' + month, (table) => {
      table.integer('id')
      table.string('property')
      table.string('value')
    })
    // (id integer, property integer, value integer)
    .createTable('input_data_num_1_' + month, (table) => {
      table.integer('id')
      table.string('property')
      table.integer('value')
    })
    // (id integer, property integer, value blob)
    .createTable('input_data_bin_1_' + month, (table) => {
      table.integer('id')
      table.string('property')
      table.binary('value')
    })
    // (id integer, relation integer, entity integer)
    .createTable('input_rel_1_' + month, (table) => {
      table.integer('id')
      table.integer('relation')
      table.integer('entity')
    })
}

exports.down = function (knex, Promise) {
  return knex.schema
    .dropTableIfExists('input_1')
    .dropTableIfExists('input_data_str_1')
    .dropTableIfExists('input_data_num_1')
    .dropTableIfExists('input_data_bin_1')
    .dropTableIfExists('input_rel_1')
}

/* Comentari per tenir la creació antiga, amb els índexos
 function initDB (customer) {
 var db = utilsDb.createDatabase(customer, 'inputs', nodeId, '2017')
 db.run('CREATE TABLE if not exists input_' + nodeId + '_201705 ' +
 '(id integer, tmp integer, gmt integer, reception integer, ' +
 'owner integer, result integer, source integer, serial text)')
 db.run('CREATE TABLE if not exists input_data_str_' + nodeId + '_201705 ' +
 '(id integer, property integer, value text)', function () {
 db.run('CREATE INDEX if not exists i_input_data_str_' +
 nodeId + '_201705_p on input_data_str_' + nodeId + '_201705 (property)')
 db.run('CREATE INDEX if not exists i_input_data_str_' +
 nodeId + '_201705_i on input_data_str_' + nodeId + '_201705 (id)')
 })
 db.run('CREATE TABLE if not exists input_data_num_' + nodeId + '_201705 ' +
 '(id integer, property integer, value integer)', function () {
 db.run('CREATE INDEX if not exists i_input_data_num_' +
 nodeId + '_201705_p on input_data_num_' + nodeId + '_201705 (property)')
 db.run('CREATE INDEX if not exists i_input_data_num_' +
 nodeId + '_201705_i on input_data_num_' + nodeId + '_201705 (id)')
 })
 db.run('CREATE TABLE if not exists input_data_bin_' + nodeId + '_201705 ' +
 '(id integer, property integer, value blob)', function () {
 db.run('CREATE INDEX if not exists i_input_data_bin_' +
 nodeId + '_201705_p on input_data_bin_' + nodeId + '_201705 (property)')
 db.run('CREATE INDEX if not exists i_input_data_bin_' +
 nodeId + '_201705_i on input_data_bin_' + nodeId + '_201705 (id)')
 })
 db.run('CREATE TABLE if not exists input_rel_' + nodeId + '_201705 ' +
 '(id integer, relation integer, entity integer)', function () {
 db.run('CREATE INDEX if not exists i_input_rel_' +
 nodeId + '_201705_r on input_rel_' + nodeId + '_201705 (relation)')
 db.run('CREATE INDEX if not exists i_input_rel_' +
 nodeId + '_201705_i on input_rel_' + nodeId + '_201705 (id)')
 })

 */

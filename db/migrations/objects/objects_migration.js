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

/* Comentari per tenir la creació antiga amb els índexos
 function initDB (customer) {
 var db = utilsDb.createDatabase(customer, 'objects', nodeId)

 db.run('CREATE TABLE if not exists entity_' + nodeId +
 ' (id integer, type text, name text, name2 text, intname text, document text, code text)', [], function () {
 db.run('CREATE UNIQUE INDEX if not exists i_entity_' + nodeId + '_id on entity_' + nodeId + ' (id)')
 db.run('CREATE INDEX if not exists i_entity_' + nodeId + '_code on entity_' + nodeId + ' (type,code)', resSQL)
 db.run('CREATE INDEX if not exists i_entity_' + nodeId + '_name on entity_' + nodeId + ' (type,name)', resSQL)
 db.run('CREATE INDEX if not exists i_entity_' + nodeId + '_nc on entity_' + nodeId + ' (type,name,name2)', resSQL)
 db.run('CREATE INDEX if not exists i_entity_' + nodeId + '_document on entity_' + nodeId + ' (type,document)', resSQL)
 })
 db.run('CREATE TABLE if not exists property_num_' + nodeId +
 ' (entity integer, property text, t1 integer, t2 integer, value integer)', [], function () {
 db.run('CREATE INDEX if not exists i_property_num_' + nodeId + '_pe on property_num_' + nodeId + ' (entity,property,t1,t2)', resSQL)
 db.run('CREATE INDEX if not exists i_property_num_' + nodeId + '_pv on property_num_' + nodeId + ' (value,property,t1,t2)', resSQL)
 })

 db.run('CREATE TABLE if not exists property_str_' + nodeId +
 ' (entity integer, property text, t1 integer, t2 integer, value text)', [], function () {
 db.run('CREATE INDEX if not exists i_property_str_' + nodeId + '_pe on property_str_' + nodeId + ' (entity,property,t1,t2)', resSQL)
 db.run('CREATE INDEX if not exists i_property_str_' + nodeId + '_pv on property_str_' + nodeId + ' (value,property,t1,t2)', resSQL)
 })

 db.run('CREATE TABLE if not exists property_bin_' + nodeId +
 ' (entity integer, property text, t1 integer, t2 integer, value blob)', [], function () {
 db.run('CREATE INDEX if not exists i_property_bin_' + nodeId + '_pe on property_bin_' + nodeId + ' (entity,property,t1,t2)', resSQL)
 })

 db.run('CREATE TABLE if not exists relation_' + nodeId +
 ' (relation text, id1 integer, id2 integer, t1 integer, t2 integer, ord integer, node integer)', [], function () {
 db.run('CREATE INDEX if not exists i_relation_' + nodeId + '_r1 on relation_' + nodeId + ' (relation,id1)')
 db.run('CREATE INDEX if not exists i_relation_' + nodeId + '_r2 on relation_' + nodeId + ' (relation,id2)')
 })
 return db
 }
 */

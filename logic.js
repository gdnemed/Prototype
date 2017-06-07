// -------------------------------------------------------------------------------------------
// Lemuria logic.
// -Implements API calls.
// -Manages upload to terminals.
// -------------------------------------------------------------------------------------------

var objects_service
var inputs_service
var coms_service

const init = (objects, inputs, coms) => {
  objects_service = objects
  inputs_service = inputs
  coms_service = coms
}

const get_records = (req, res) => {
  var customer = 'SPEC'
  objects_service.get_entities(customer, 'record', 'code id,name', function (err, rows) {
    if (err)	res.status(500).end(err.message)
    else res.status(200).jsonp(rows)
  })
}

const post_record = (req, res) => {
  var customer = 'SPEC'
  // Don't allow records wihout identifier or id
  if (req.body.id == null) {
    res.status(400).end()
    return
  }
  var e = {type: 'record', code: req.body.id, name: req.body.name}
  objects_service.get_entity(customer, 'record', 'code', e.code, 'id', function (err, entity_array) {
    if (err) {
      res.status(500).end(err.message)
      return
    }
    if (entity_array && entity_array.length > 0) {
      // Update
      e.id = entity_array[0].id
      objects_service.update_entity(customer, e, function (err, id) {
        if (err) res.status(500).end(err.message)
        else set_properties(customer, e, req, res, 200)
      })
    } else {
      // Insert
      objects_service.insert_entity(customer, e, function (err, id) {
        if (err) res.status(500).end(err.message)
        else {
          e.id = id
          set_properties(customer, e, req, res, 201)
        }
      })
    }
  })
}

const set_properties = (customer, e, req, res, code_result) => {
  var l = []
  if (req.body.language) l.push({property: 'language', value: req.body.language})
  set_property(customer, e.id, l, 0, function (err) {
    if (err) res.status(500).end(err.message)
    else {
      res.status(code_result).end(String(e.id))
      // send to terminals
      console.log('send ' + e.code)
      coms_service.global_send('record_insert', {records: [{id: e.code}]})
    }
  })
}

const set_property (customer, id, l, i, callback) => {
  if (i >= l.length) callback()
  else {
    objects_service.insert_property(customer, id, l[i], function (err) {
      if (err) res.status(500).end(err.message)
      else set_property(customer, id, l, i + 1, callback)
    })
  }
}

const delete_record = (req, res) => {
  objects_service.delete_entity(customer, 'code', req.params.id, function (err, rows) {
    if (err)	res.status(500).end(err.message)
    else res.status(200).end()
  })
}

const get_cards = (req, res) => {
  var customer = 'SPEC'
  objects_service.get_entity(customer, 'record', 'code', req.params.id, 'id', function (err, rows) {
    if (err)res.status(500).end(err.message)
    else if (rows == null || rows.length == 0) res.status(404).end()
    else {
      objects_service.get_simple_relation(customer, rows[0].id, 'identifies', false, 'card', function (err, rows) {
        if (err)	res.status(500).end(err.message)
    		else {
          var l = []
          for (var i = 0; i < rows.length; i++) l.push(rows[i].code)
          res.status(200).jsonp(l)
        }
      })
    }
  })
}

const post_cards = (req, res) => {
  var customer = 'SPEC'
  objects_service.get_entity(customer, 'record', 'code', req.params.id, 'id', function (err, rows) {
    if (err)res.status(500).end(err.message)
    else if (rows == null || rows.length == 0) res.status(404).end()
    else {
      var id = rows[0].id
      objects_service.get_simple_relation(customer, id, 'identifies', false, 'card', function (err, rows) {
        if (err) res.status(500).end(err.message)
    		else {
          var l = []
          for (var i = 0; i < req.body.length; i++) l.push({type: 'card', code: req.body[i], node: 1})
          objects_service.process_relations(customer, {id: id, type: 'record'},
          'identifies', false, 'code', rows, l, function (r, result) {
            if (r != null)	res.status(500).end(r.message)
        		else {
              res.status(200).end()
              send_cards(result)
            }
          })
        }
      })
    }
  })
}

/*
Informs communications about new cards inserts.
*/
const send_cards = (result) => {
  for (var i = 0; i < result.inserts.length; i++) {
    var ins = result.inserts[i]
    coms_service.global_send('card_insert', {cards: [{card: ins.field, id: ins.id2}]})
  }
}

cosnt get_fingerprints = (req, res) => {
  var customer = 'SPEC'

  // TODO: search by code
  objects_service.get_property(customer, 'fingerprint', parseInt(req.params.id), function (err, rows) {
    if (err)	res.status(500).end(err.message)
    else {
      var l = []
      for (var i = 0; i < rows.length; i++) l.push(rows[i].value)
      res.status(200).jsonp(l)
    }
  })
}

const post_fingerprints = (req, res) => {
  var customer = 'SPEC'

  // TODO: search by code
  var id = parseInt(req.params.id)
  objects_service.get_simple_property(customer, 'fingerprint', id, function (err, rows) {
    if (err) res.status(500).end(err.message)
    else {
      var f = objects_service.process_properties(customer, id, 'fingerprint', rows, req.body, function (r) {
        if (r != null)	res.status(500).end(r.message)
    		else res.status(200).end()
      })
    }
  })
}

const post_enroll = (req, res) => {
  var customer = 'SPEC'
  objects_service.get_entity(customer, 'record', 'code', req.params.id, 'id', function (err, rows) {
    if (err)res.status(500).end(err.message)
    else if (rows == null || rows.length == 0) res.status(404).end()
    else {
      var id = rows[0].id;
      objects_service.get_simple_property(customer, 'enroll', id, function (err, rows) {
        if (err) res.status(500).end(err.message)
    		else {
          var f = objects_service.process_properties(customer, id, 'enroll', rows, [req.body.enroll], function (r) {
            if (r != null)	res.status(500).end(r.message)
        		else res.status(200).end()
          })
        }
      })
    }
  })
}

const get_clockings = (req, res) => {
  var customer = 'SPEC'
  inputs_service.get_inputs_complete(customer, function (err, rows) {
    if (err)	res.status(500).end(err.message)
    else res.status(200).jsonp(rows);
  })
}

const get_clockings_debug = (req, res) => {
  var customer = 'SPEC'
  inputs_service.get_inputs(customer, function (err, r) {
    if (err)	res.status(500).end(err.message)
    else res.status(200).jsonp({input: r[0], input_data_str: r[1]})
  })
}

const init_terminal = (serial) => {
  var customer = 'SPEC'
  objects_service.get_entities(customer, 'record', 'CAST(code as integer) id', function (err, rows) {
    if (err)	console.log(err.message)
    else coms_service.global_send('record_insert', {records: rows})
  })
  objects_service.get_both_relation(customer, 'identifies', 'code card', 'CAST(code as integer) id', function (err, rows) {
    if (err)	console.log(err.message)
    else coms_service.global_send('card_insert', {cards: rows})
  })
}

const create_clocking = (clocking, customer, callback) => {
  objects_service.get_entity(customer, 'record', 'code', clocking.record, 'id', function (err, rows) {
    if (err) callback(err)
    else {
      if (rows && rows.length > 0) clocking.owner = rows[0].id
      inputs_service.create_clocking(clocking, customer, callback)
    }
  })
}

/*
Upload process.
-tab: Table (records, time types,...) to upload.
-tv: Table version.
-customer: Customer to serve.
-node: Id of node.
-serial: Serial of the terminal to upload.
*/
const get_pending_registers = (tab, tv, customer, node, serial) => {
  switch (tab) {
    // TODO: Falta el where amb la versió
    case 'record':objects_service.get_entities(customer, 'record', 'CAST(code as integer) id',
        function (err, rows) {
          coms_service.send_data(serial, 'record_insert', {records: rows})
        })
      break
  }
}

module.exports = {
  init:init,
  get_records:get_records,
  post_record:post_record,
  delete_record:delete_record,
  get_cards:get_cards,
  post_cards:post_cards,
  post_enroll:post_enroll,
  get_clockings:get_clockings,
  get_clockings_debug:get_clockings_debug,
  init_terminal:init_terminal,
  get_fingerprints:get_fingerprints,
  post_fingerprints:post_fingerprints,
  init_terminal:init_terminal,
  create_clocking:create_clocking,
  get_pending_registers:get_pending_registers
}

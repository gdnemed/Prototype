// -------------------------------------------------------------------------------------------
// Lemuria logic.
// -Implements API calls.
// -Manages upload to terminals.
// -------------------------------------------------------------------------------------------

const logger = require.main.require('./utils/log').getLogger('coms')

var objectsService
var inputsService
var comsService

const init = (objects, inputs, coms) => {
  objectsService = objects
  inputsService = inputs
  comsService = coms
}

const getRecords = (req, res) => {
  var customer = 'SPEC'
  objectsService.get_entities(customer, 'record', 'code id,name', function (err, rows) {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(rows)
  })
}

const postRecord = (req, res) => {
  var customer = 'SPEC'
  // Don't allow records wihout identifier or id
  if (req.body.id == null) {
    res.status(400).end()
    return
  }
  var e = {type: 'record', code: req.body.id, name: req.body.name}
  objectsService.get_entity(customer, 'record', 'code', e.code, 'id',
    function (err, entityArray) {
      if (err) {
        res.status(500).end(err.message)
        return
      }
      if (entityArray && entityArray.length > 0) {
        // Update
        e.id = entityArray[0].id
        objectsService.update_entity(customer, e, function (err, id) {
          if (err) res.status(500).end(err.message)
          else setProperties(customer, e, req, res, 200)
        })
      } else {
        // Insert
        objectsService.insert_entity(customer, e, function (err, id) {
          if (err) res.status(500).end(err.message)
          else {
            e.id = id
            setProperties(customer, e, req, res, 201)
          }
        })
      }
    })
}

const setProperties = (customer, e, req, res, codeResult) => {
  var l = []
  if (req.body.language) l.push({property: 'language', value: req.body.language})
  setProperty(customer, e.id, l, 0, function (err) {
    if (err) res.status(500).end(err.message)
    else {
      res.status(codeResult).end(String(e.id))
      // send to terminals
      comsService.global_send('record_insert', {records: [{id: e.code}]})
    }
  })
}

const setProperty = (customer, id, l, i, callback) => {
  if (i >= l.length) callback()
  else {
    objectsService.insert_property(customer, id, l[i], function (err) {
      if (err) callback(err)
      else setProperty(customer, id, l, i + 1, callback)
    })
  }
}

const deleteRecord = (req, res) => {
  var customer = 'SPEC'
  objectsService.delete_entity(customer, 'code', req.params.id, function (err, rows) {
    if (err) res.status(500).end(err.message)
    else res.status(200).end()
  })
}

const getCards = (req, res) => {
  var customer = 'SPEC'
  objectsService.get_entity(customer, 'record', 'code', req.params.id, 'id', function (err, rows) {
    if (err)res.status(500).end(err.message)
    else if (rows === null || rows.length === 0) res.status(404).end()
    else {
      objectsService.get_simple_relation(customer, rows[0].id, 'identifies', false, 'card', function (err, rows) {
        if (err) res.status(500).end(err.message)
        else {
          var l = []
          for (var i = 0; i < rows.length; i++) l.push(rows[i].code)
          res.status(200).jsonp(l)
        }
      })
    }
  })
}

const postCards = (req, res) => {
  var customer = 'SPEC'
  objectsService.get_entity(customer, 'record', 'code', req.params.id, 'id', function (err, rows) {
    if (err)res.status(500).end(err.message)
    else if (rows == null || rows.length === 0) res.status(404).end()
    else {
      var id = rows[0].id
      objectsService.get_simple_relation(customer, id, 'identifies', false, 'card', function (err, rows) {
        if (err) res.status(500).end(err.message)
        else {
          var l = []
          for (var i = 0; i < req.body.length; i++) l.push({type: 'card', code: req.body[i], node: 1})
          objectsService.process_relations(customer, {id: id, type: 'record'},
          'identifies', false, 'code', rows, l, function (r, result) {
            if (r != null) res.status(500).end(r.message)
            else {
              res.status(200).end()
              sendCards(result)
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
const sendCards = (result) => {
  for (var i = 0; i < result.inserts.length; i++) {
    var ins = result.inserts[i]
    comsService.global_send('card_insert', {cards: [{card: ins.field, id: ins.id2}]})
  }
}

const getFingerprints = (req, res) => {
  var customer = 'SPEC'

  // TODO: search by code
  objectsService.get_property(customer, 'fingerprint', parseInt(req.params.id), function (err, rows) {
    if (err) res.status(500).end(err.message)
    else {
      var l = []
      for (var i = 0; i < rows.length; i++) l.push(rows[i].value)
      res.status(200).jsonp(l)
    }
  })
}

const postFingerprints = (req, res) => {
  var customer = 'SPEC'

  // TODO: search by code
  var id = parseInt(req.params.id)
  objectsService.get_simple_property(customer, 'fingerprint', id, function (err, rows) {
    if (err) res.status(500).end(err.message)
    else {
      objectsService.process_properties(customer, id, 'fingerprint', rows, req.body, function (r) {
        if (r != null) res.status(500).end(r.message)
        else res.status(200).end()
      })
    }
  })
}

const postEnroll = (req, res) => {
  var customer = 'SPEC'
  objectsService.get_entity(customer, 'record', 'code', req.params.id, 'id', function (err, rows) {
    if (err)res.status(500).end(err.message)
    else if (rows == null || rows.length === 0) res.status(404).end()
    else {
      var id = rows[0].id
      objectsService.get_simple_property(customer, 'enroll', id, function (err, rows) {
        if (err) res.status(500).end(err.message)
        else {
          objectsService.process_properties(customer,
            id, 'enroll', rows, [req.body.enroll], function (r) {
              if (r != null) res.status(500).end(r.message)
              else res.status(200).end()
            })
        }
      })
    }
  })
}

const getClockings = (req, res) => {
  var customer = 'SPEC'
  inputsService.get_inputs_complete(customer, function (err, rows) {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(rows)
  })
}

const getClockingsDebug = (req, res) => {
  var customer = 'SPEC'
  inputsService.get_inputs(customer, function (err, r) {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp({input: r[0], input_data_str: r[1]})
  })
}

const initTerminal = (serial) => {
  var customer = 'SPEC'
  objectsService.get_entities(customer, 'record', 'CAST(code as integer) id', function (err, rows) {
    if (err) logger.error(err.message)
    else comsService.global_send('record_insert', {records: rows})
  })
  objectsService.get_both_relation(customer, 'identifies', 'code card', 'CAST(code as integer) id', function (err, rows) {
    if (err) logger.error(err.message)
    else comsService.global_send('card_insert', {cards: rows})
  })
}

const createClocking = (clocking, customer, callback) => {
  objectsService.get_entity(customer, 'record', 'code', clocking.record, 'id', function (err, rows) {
    if (err) callback(err)
    else {
      if (rows && rows.length > 0) clocking.owner = rows[0].id
      inputsService.create_clocking(clocking, customer, callback)
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
const getPendingRegisters = (tab, tv, customer, node, serial) => {
  switch (tab) {
    // TODO: Falta el where amb la versió
    case 'record':objectsService.get_entities(customer, 'record', 'CAST(code as integer) id',
        function (err, rows) {
          if (err) logger.error(err.message)
          else comsService.send_data(serial, 'record_insert', {records: rows})
        })
      break
  }
}

module.exports = {
  init: init,
  getRecords: getRecords,
  postRecord: postRecord,
  deleteRecord: deleteRecord,
  getCards: getCards,
  postCards: postCards,
  postEnroll: postEnroll,
  getClockings: getClockings,
  getClockingsDebug: getClockingsDebug,
  initTerminal: initTerminal,
  getFingerprints: getFingerprints,
  postFingerprints: postFingerprints,
  createClocking: createClocking,
  getPendingRegisters: getPendingRegisters
}

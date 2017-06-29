// -------------------------------------------------------------------------------------------
// Lemuria logic.
// -Implements API calls.
// -Manages upload to terminals.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require.main.require('./utils/log').getLogger('coms')

var objectsService
var inputsService
var comsService

let prepGetRecords = {
  _entity_: '[record]',
  name: 'name',
  id: 'document',
  code: 'code',
  language: {_property_: 'language'},
  validity: {_property_: '[validity]', start: 't1', end: 't2'},
  timetype_grp: {_property_: '[ttgroup]', code: 'value', start: 't1', end: 't2'},
  card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
}

const init = (objects, inputs, coms) => {
  objectsService = objects
  inputsService = inputs
  comsService = coms
  if (!objectsService.prepare(prepGetRecords)) logger.error('prepGetRecords not prepared.')
}

const getRecords = (req, res, session) => {
  /* objectsService.structuredGet('SPEC', {},
    {
      _entity_: '[record]',
      name: 'name',
      id: 'document',
      code: 'code',
      language: {_property_: 'language'},
      validity: {_property_: '[validity]', start: 't1', end: 't2'},
      timetype_grp: {_property_: '[ttgroup]', code: 'value', start: 't1', end: 't2'},
      card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
    },
    (err, ret) => {
      if (err) res.status(500).end(err.message)
      else res.status(200).jsonp(ret)
    }) */
  objectsService.get(null, {now: session.now, today: session.today}, prepGetRecords, (err, ret) => {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(ret)
  })
}

const postRecord = (req, res) => {
  if (req.body.id) {
    var str = {
      _op_: 'put',
      _entity_: 'record',
      _key_: 'id',
      name: 'name',
      id: 'document',
      code: 'code',
      language: {_property_: 'language'},
      timetype_grp: {_property_: '[ttgroup]', _op_: 'simple', code: 'value', start: 't1', end: 't2'},
      validity: {_property_: '[validity]', _op_: 'simple', start: 't1', end: 't2'},
      card: {
        _relation_: '[<-identifies]',
        _op_: 'simple',
        _key_: 'code',
        code: 'code',
        start: 't1',
        end: 't2'
      }
    }
    objectsService.structuredPut(
      {
        customer: 'SPEC',
        str: str,
        data: req.body,
        callback: (err, ret) => {
          if (err) res.status(500).end(err.message)
          else {
            res.status(200).jsonp(ret)
            nextVersion(ret)// Notify communications
          }
        }
      })
  } else res.status(400).end()
}

const deleteRecord = (req, res) => {
  var customer = 'SPEC'
  objectsService.deleteFromField(customer, 'record', 'document', req.params.id, function (err, rows) {
    if (err) res.status(500).end(err.message)
    else res.status(200).end()
  })
}

const getCards = (req, res) => {
  objectsService.structuredGet('SPEC', {},
    {
      _entity_: 'record',
      _subquery_: {
        _relation_: '[<-identifies]',
        code: 'code',
        start: 't1',
        end: 't2'
      },
      _filter_: 'document=\'' + req.params.id + '\''
    },
    (err, ret) => {
      if (err) res.status(500).end(err.message)
      else res.status(200).jsonp(ret)
    })
}

const postCards = (req, res) => {
  var str = {
    _op_: 'search',
    _entity_: 'record',
    _filter_: 'document=\'' + req.params.id + '\'',
    _subquery_: {
      _relation_: '[<-identifies]',
      _op_: 'simple',
      _key_: 'code',
      code: 'code',
      start: 't1',
      end: 't2'
    }
  }
  objectsService.structuredPut(
    {
      customer: 'SPEC',
      str: str,
      data: req.body,
      callback: (err, ret) => {
        if (err) res.status(500).end(err.message)
        else {
          res.status(200).jsonp(ret)
          nextVersion(ret)// Notify communications
        }
      }
    })
}

/*
Indicates something has changed, so the terminals should be updated
*/
const nextVersion = (obj) => {
  logger.debug('nextVersion')
  logger.debug(obj)
  objectsService.structuredGet('SPEC', {},
    {
      _entity_: 'record',
      _id_: obj,
      code: 'code',
      card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
    },
    (err, ret) => {
      if (err) logger.error(err)
      else {
        logger.debug(ret)
        if (ret) {
          let card = ret.card
          if (card) {
            for (let i = 0; i < card.length; i++) {
              if (ret.code) {
                comsService.globalSend('record_insert', {records: {id: parseInt(ret.code)}})
                comsService.globalSend('card_insert', {cards: {card: card[i].code, id: parseInt(ret.code)}})
              }
            }
          }
        }
      }
    })
}

const getInfo = (req, res) => {
  objectsService.structuredGet('SPEC', {},
    {
      _entity_: 'record',
      _filter_: 'document=\'' + req.params.id + '\'',
      id: 'document',
      info: {
        _property_: 'info',
        value: 'value',
        date: 't1'
      }
    },
    (err, ret) => {
      if (err) res.status(500).end(err.message)
      else res.status(200).jsonp(ret)
    })
}

const getInfos = (req, res) => {
  objectsService.structuredGet('SPEC', {},
    {
      _entity_: '[record]',
      id: 'document',
      info: {
        _property_: 'info',
        value: 'value',
        date: 't1'
      }
    },
    (err, ret) => {
      if (err) res.status(500).end(err.message)
      else res.status(200).jsonp(ret)
    })
}

const postInfo = (req, res) => {
  logger.trace('postRecord')
  logger.trace(req.body)
  var str = {
    _op_: 'search',
    _entity_: 'record',
    _filter_: 'document=\'' + req.params.id + '\'',
    _subquery_: {
      _property_: 'info',
      _op_: 'simple',
      _key_: 'value',
      value: 'value',
      date: 't1'
    }
  }
  objectsService.structuredPut(
    {
      customer: 'SPEC',
      str: str,
      data: req.body,
      callback: (err, ret) => {
        if (err) res.status(500).end(err.message)
        else {
          res.status(200).jsonp(ret)
          nextVersion(ret)// Notify communications
        }
      }
    })
}

const initTerminal = (serial) => {
  objectsService.structuredGet('SPEC', {},
    {
      _entity_: '[record]',
      code: 'code',
      card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
    },
    (err, ret) => {
      if (err) logger.error(err)
      else {
        for (let i = 0; i < ret.length; i++) {
          if (ret[i].code && ret[i].code !== null) {
            let r = {id: parseInt(ret[i].code)}
            comsService.globalSend('record_insert', {records: [r]})
            let card = ret[i].card
            if (card) {
              for (let j = 0; j < card.length; j++) {
                let e = {card: card[j].code, id: parseInt(ret[i].code)}
                comsService.globalSend('card_insert', {cards: [e]})
              }
            }
          }
        }


      }
    })
}

const getFingerprints = (req, res) => {
}

const postFingerprints = (req, res) => {
}

const postEnroll = (req, res) => {
  var str = {
    _op_: 'search',
    _entity_: 'record',
    _filter_: 'document=\'' + req.params.id + '\'',
    enroll: {
      _property_: 'enroll',
      _op_: 'simple'
    }
  }
  objectsService.structuredPut(
    {
      customer: 'SPEC',
      str: str,
      data: req.body,
      callback: (err, ret) => {
        if (err) res.status(500).end(err.message)
        else {
          res.status(200).jsonp(ret)
          nextVersion(ret)// Notify communications
        }
      }
    })
}

const getClockings = (req, res) => {
  var customer = 'SPEC'
  inputsService.getInputsComplete(customer, function (err, rows) {
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

const getTimeTypes = (req, res) => {
  objectsService.structuredGet('SPEC', {},
    {
      _entity_: '[timetype]',
      name: 'name',
      id: 'id',
      code: 'code',
      intnames: 'intname',
      timetype_grp: {_property_: '[ttgroup]', code: 'value'}
    },
    (err, ret) => {
      if (err) res.status(500).end(err.message)
      else res.status(200).jsonp(ret)
    })
  /* var customer = 'SPEC'
  objectsService.get_entities(customer, 'timetype', 'id,code,name', function (err, rows) {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(rows)
  }) */
}

const getTimeType = (req, res) => {
  var customer = 'SPEC'
  objectsService.get_entity(customer, 'timetype', 'code', req.params.id, '', function (err, rows) {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(rows)
  })
}

const postTimeType = (req, res) => {
  logger.trace('postRecord')
  logger.trace(req.body)
  var str = {
    _op_: 'put',
    _entity_: 'timetype',
    _key_: 'code',
    name: 'name',
    code: 'code',
    language: 'intname',
    ttgroup: {_property_: '[ttgroup]', _op_: 'multiple'}
  }
  objectsService.structuredPut(
    {
      customer: 'SPEC',
      str: str,
      data: req.body,
      callback: (err, ret) => {
        if (err) res.status(500).end(err.message)
        else {
          res.status(200).jsonp(ret)
          nextVersion(ret)// Notify communications
        }
      }
    })
}

const deleteTimeType = (req, res) => {
  var customer = 'SPEC'
  objectsService.deleteFromField(customer, 'timetype', 'code', req.params.id, function (err, rows) {
    if (err) res.status(500).end(err.message)
    else res.status(200).end()
  })
}

const createClocking = (clocking, customer, callback) => {
  objectsService.structuredGet('SPEC', {},
    {
      _entity_: 'record',
      id: 'id',
      filter: 'code=\'' + clocking.record + '\''
    }, (err, record) => {
      if (err) callback(err)
      else {
        if (record) clocking.owner = record.id
        inputsService.createClocking(clocking, customer, callback)
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
    case 'record':// comsService.sendData(serial, 'record_insert', {records: rows})
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
  getInfo: getInfo,
  getInfos: getInfos,
  postInfo: postInfo,
  postEnroll: postEnroll,
  getClockings: getClockings,
  getClockingsDebug: getClockingsDebug,
  initTerminal: initTerminal,
  getFingerprints: getFingerprints,
  postFingerprints: postFingerprints,
  createClocking: createClocking,
  getPendingRegisters: getPendingRegisters,
  getTimeTypes: getTimeTypes,
  getTimeType: getTimeType,
  postTimeType: postTimeType,
  deleteTimeType: deleteTimeType
}

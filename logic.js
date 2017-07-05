// -------------------------------------------------------------------------------------------
// Lemuria logic.
// -Implements API calls.
// -Manages upload to terminals.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require.main.require('./utils/log').getLogger('coms')
const squeries = require.main.require('./objects/squeries')

let stateService, inputsService,comsService, mainModule

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

let prepGetRecord = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
  name: 'name',
  id: 'document',
  code: 'code',
  language: {_property_: 'language'},
  validity: {_property_: '[validity]', start: 't1', end: 't2'},
  timetype_grp: {_property_: '[ttgroup]', code: 'value', start: 't1', end: 't2'},
  card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
}

let prepPutRecords = {
  _entity_: 'record',
  name: 'name',
  id: 'document',
  code: 'code',
  language: {_property_: 'language'},
  timetype_grp: {_property_: 'ttgroup', code: 'value', start: 't1', end: 't2'},
  validity: {_property_: 'validity', start: 't1', end: 't2'},
  card: {
    _relation_: '[identifies<-card]',
    code: 'code',
    start: 't1',
    end: 't2'
  }
}

let prepGetCards = {
  _entity_: 'record',
  _related_: {
    _relation_: '[<-identifies]',
    code: 'code',
    start: 't1',
    end: 't2'
  },
  _filter_: {field: 'document', variable: 'id'}
}

let prepPutCards = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
  cards: {
    _relation_: '[<-identifies]',
    code: 'code',
    start: 't1',
    end: 't2'
  }
}

const init = (state, inputs, coms) => {
  stateService = state
  inputsService = inputs
  comsService = coms
  // if (!objectsService.prepare(prepGetRecords)) logger.error('prepGetRecords not prepared.')
}

const getRecords = (req, res, session) => {
  squeries.get(session, req.params, prepGetRecords, (err, ret) => {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(ret)
  })
}

const getRecord = (req, res, session) => {
  squeries.get(session, req.params, prepGetRecord, (err, ret) => {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(ret)
  })
}

const postRecord = (req, res, session) => {
  if (req.body.id) {
    logger.debug(req.body)
    squeries.put(session,
      stateService,
      req.params,
      prepPutRecords, req.body, (err, ret) => {
        if (err) res.status(500).end(err.message)
        else {
          res.status(200).jsonp([ret])
          nextVersion(session, [ret])// Notify communications
        }
      })
  } else res.status(400).end()
}

const deleteRecord = (req, res, session) => {
  squeries.del(session, req.params, {_entity_: 'record'}, null, function (err, rows) {
    if (err) res.status(500).end(err.message)
    else res.status(200).end()
  })
}

const getCards = (req, res, session) => {
  squeries.get(session, req.params, prepGetCards, (err, ret) => {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(ret)
  })
}

const postCards = (req, res, session) => {
  squeries.put(session, {},
    prepPutCards, req.body, (err, ret) => {
      if (err) res.status(500).end(err.message)
      else {
        res.status(200).end(ret)
        nextVersion(ret)// Notify communications
      }
    })
}

/*
Indicates something has changed, so the terminals should be updated
*/
const nextVersion = (session, obj) => {
  logger.debug('nextVersion')
  logger.debug(obj)
  squeries.get(session, {id: obj[0]},
    {
      _entity_: 'record',
      _filter_: {field: 'id', variable: 'id'},
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

const initTerminal = (serial, customer) => {
  let session = createSession(customer)
  squeries.get(session, {},
    {
      _entity_: '[record]',
      code: 'code',
      card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
    }, (err, ret) => {
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

const getClockings = (req, res, session) => {
  squeries.get(session, req.params,
    {
      _inputs_: '201707',
      tmp: 'tmp',
      card: {_property_: 'card'},
      record: {_property_: 'record'},
      result: 'result'
    }, (err, rows) => {
      if (err) res.status(500).end(err.message)
      else res.status(200).jsonp(rows)
    })
}

const getClockingsDebug = (req, res, session) => {
  squeries.get(session, req.params,
    {
      _inputs_: '201707',
      id: 'id',
      tmp: 'tmp',
      gmt: 'gmt',
      card: {_property__: 'card'},
      record: {_property__: 'record'},
      result: 'result',
      owner: 'owner',
      reception: 'reception',
      serial: 'serial'
    }, (err, rows) => {
      if (err) res.status(500).end(err.message)
      else res.status(200).jsonp(rows)
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
  let session = createSession(customer)
  // Find the owner
  squeries.get(session, {record: clocking.record},
    {
      _entity_: 'record',
      id: 'id',
      _filter_: {field: 'code', variable: 'record'}
    }, (err, record) => {
      if (err) callback(err)
      else {
        if (record && record.length > 0) clocking.owner = record[0].id
        squeries.put(session, stateService, {},
          {
            _inputs_: 'input',
            tmp: 'tmp',
            gmt: 'gmt',
            reception: 'reception',
            owner: 'owner',
            source: 'source',
            result: 'result',
            serial: 'serial',
            card: {_property_: 'card'},
            record: {_property_: 'record'}
          }, clocking, callback)
        // inputsService.createClocking(clocking, customer, callback)
      }
    })
}

const createSession = (customer) => {
  if (!mainModule) mainModule = require.main.require('./lemuria')
  let ts = new Date().getTime()
  let now = moment.tz(ts, 'GMT').format('YYYYMMDDHHmmss')
  let session = {
    name: customer,
    dbs: mainModule.getDatabases(customer),
    now: parseInt(now),
    today: parseInt(now.substring(0, 8))
  }
  return session
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
  getRecord: getRecord,
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

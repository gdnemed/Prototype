// -------------------------------------------------------------------------------------------
// Lemuria logic.
// -Implements API calls.
// -Manages upload to terminals.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require.main.require('./utils/log').getLogger('coms')
const squeries = require.main.require('./objects/squeries')

let stateService, comsService, mainModule

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

let prepPutEnroll = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
  enroll: {_property_: 'enroll'}
}

let prepPutInfo = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
  _subquery_: {
    _property_: 'info',
    value: 'value',
    date: 't1'
  }
}

const init = (state, coms) => {
  stateService = state
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
  // First, search record real id
  squeries.get(session, req.params,
    {
      _entity_: 'record',
      id: 'id',
      _filter_: {field: 'document', variable: 'id'}
    }, (err, record) => {
      if (err) res.status(500).end(err.message)
      else {
        // Now, delete
        if (record && record.length > 0) {
          squeries.del(session, {id: record[0].id}, {_entity_: 'record'},
            null, (err, rows) => {
              if (err) res.status(500).end(err.message)
              else res.status(200).end()
            })
        } else res.status(404).end()
      }
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

const getInfo = (req, res, session) => {
  squeries.get(session, req.params,
    {
      _entity_: 'record',
      _filter_: {field: 'document', variable: 'id'},
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

const getInfos = (req, res, session) => {
  squeries.get(session, req.params,
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

const postInfo = (req, res, session) => {
  squeries.put(session, req.params,
    prepPutInfo, req.body, (err, result) => {
      if (err) res.status(500).end(err.message)
      else res.status(200).end()
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
            comsService.send(serial, 'record_insert', {records: [r]})
            let card = ret[i].card
            if (card) {
              for (let j = 0; j < card.length; j++) {
                let e = {card: card[j].code, id: parseInt(ret[i].code)}
                comsService.send(serial, 'card_insert', {cards: [e]})
              }
            }
          }
        }
      }
    })
}

const getFingerprints = (req, res, session) => {
  res.status(501).end()
}

const postFingerprints = (req, res, session) => {
  res.status(501).end()
}

const postEnroll = (req, res, session) => {
  squeries.put(session, req.params,
      prepPutEnroll, req.body,
      (err, ret) => {
        if (err) res.status(500).end(err.message)
        else {
          res.status(200).jsonp(ret)
          nextVersion(ret)// Notify communications
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

const getTimeTypes = (req, res, session) => {
  squeries.get(session, req.params,
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
}

const getTimeType = (req, res, session) => {
  squeries.get(session, req.params,
    {
      _entity_: '[timetype]',
      _filter_: {field: 'code', variable: 'id'},
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
}

const postTimeType = (req, res, session) => {
  var str = {
    _entity_: 'timetype',
    name: 'name',
    code: 'code',
    language: 'intname',
    ttgroup: {_property_: '[ttgroup]', _op_: 'multiple'}
  }
  squeries.put(session, req.params, str,
      req.body, (err, ret) => {
        if (err) res.status(500).end(err.message)
        else {
          res.status(200).jsonp(ret)
          nextVersion(ret)// Notify communications
        }
      })
}

const deleteTimeType = (req, res, session) => {
  // First, search time type real id
  squeries.get(session, req.params,
    {
      _entity_: 'timetype',
      id: 'id',
      _filter_: {field: 'code', variable: 'id'}
    }, (err, record) => {
      if (err) res.status(500).end(err.message)
      else {
        // Now, delete
        if (record && record.length > 0) {
          squeries.del(session, {id: record[0].id}, {_entity_: 'timetype'},
            null, (err, rows) => {
              if (err) res.status(500).end(err.message)
              else res.status(200).end()
            })
        } else res.status(404).end()
      }
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

// -------------------------------------------------------------------------------------------
// Lemuria logic.
// -Implements API calls.
// -Manages upload to terminals.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require.main.require('./utils/log').getLogger('coms')
const squeries = require.main.require('./objects/squeries')
const CT = require.main.require('./CT')

let stateService, comsService, main

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
  timetype_grp: {_property_: '[ttgroup]', code: 'value', start: 't1', end: 't2'},
  validity: {_property_: '[validity]', start: 't1', end: 't2'},
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

let prepGetTimeTypes = {
  _entity_: '[timetype]',
  name: 'name',
  code: 'code',
  text: 'intname',
  timetype_grp: {_property_: '[ttgroup]', code: 'value'}
}

let prepGetTimeType = {
  _entity_: 'timetype',
  _filter_: {field: 'code', variable: 'id'},
  code: 'code',
  text: 'intname',
  timetype_grp: {_property_: '[ttgroup]', code: 'value'}
}

let prepPutTtype = {
  _entity_: 'timetype',
  code: 'code',
  text: 'intname',
  ttgroup: {_property_: 'ttgroup', _op_: 'multiple'}
}

let prepPutEnroll = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
  enroll: {_property_: 'enroll'}
}

let prepGetInfo = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
  id: 'document',
  info: {
    _property_: 'info',
    value: 'value',
    date: 't1'
  }
}

let prepGetInfos = {
  _entity_: '[record]',
  id: 'document',
  info: {
    _property_: 'info',
    value: 'value',
    date: 't1'
  }
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

let prepGetClockings = {
  _inputs_: '201707',
  tmp: 'tmp',
  card: {_property_: 'card'},
  record: {_property_: 'record'},
  result: 'result'
}

let prepGetClockingsDebug = {
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
}

let prepPutClocking = {
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
}

const init = (state, coms) => {
  stateService = state
  comsService = coms
  if (!main) main = require.main.require('./lemuria')
}

const get = (req, res, session, str) => {
  squeries.get(session, req.params, str, (err, ret) => {
    if (err) res.status(500).end(err.message)
    else res.status(200).jsonp(ret)
  })
}

const put = (req, res, session, str) => {
  squeries.put(session,
    stateService,
    req.params,
    str, req.body, extraTreatment, (err, ret) => {
      if (err) res.status(500).end(err.message)
      else {
        res.status(200).jsonp([ret])
        nextVersion(session, [ret], str._entity_)// Notify communications
      }
    })
}

const del = (req, res, session, filter, entity) => {
  // First, search record real id
  squeries.get(session, req.params,
    {
      _entity_: entity,
      id: 'id',
      _filter_: filter
    }, (err, record) => {
      if (err) res.status(500).end(err.message)
      else {
        // Now, delete
        if (record && record.length > 0) {
          squeries.del(session, {id: record[0].id}, {_entity_: entity},
            extraTreatment, (err, rows) => {
              if (err) res.status(500).end(err.message)
              else res.status(200).end()
            })
        } else res.status(404).end()
      }
    })
}

const apiCall = (op, param1, param2) => {
  return (req, res) => main.manageSession(req, res,
    (req, res, session) => op(req, res, session, param1, param2))
}

const initAPI = (api) => {
  if (!main) main = require.main.require('./lemuria')
  api.get('/api/coms/records', apiCall(get, prepGetRecords))
  api.get('/api/coms/records/:id', apiCall(get, prepGetRecord))
  api.post('/api/coms/records', apiCall(put, prepPutRecords))
  api.post('/api/coms/records/:id', apiCall(put, prepPutRecords))
  api.delete('/api/coms/records/:id', apiCall(del, {field: 'document', variable: 'id'}, 'record'))
  api.get('/api/coms/records/:id/cards', apiCall(get, prepGetCards))
  api.post('/api/coms/records/:id/cards', apiCall(put, prepPutCards))
  api.get('/api/coms/records/:id/fingerprints', (req, res) => res.status(501).end())
  api.post('/api/coms/records/:id/fingerprints', (req, res) => res.status(501).end())
  api.post('/api/coms/records/:id/enroll', apiCall(put, prepPutEnroll))
  api.get('/api/coms/records/:id/info', apiCall(get, prepGetInfo))
  api.get('/api/coms/infos', apiCall(get, prepGetInfos))
  api.post('/api/coms/records/:id/info', apiCall(put, prepPutInfo))
  api.get('/api/coms/clockings', apiCall(get, prepGetClockings))
  api.get('/api/coms/clockings_debug', apiCall(get, prepGetClockingsDebug))
  api.get('/api/coms/timetypes', apiCall(get, prepGetTimeTypes))
  api.get('/api/coms/timetypes/:id', apiCall(get, prepGetTimeType))
  api.post('/api/coms/timetypes', apiCall(put, prepPutTtype))
  api.post('/api/coms/timetypes/:id', apiCall(put, prepPutTtype))
  api.delete('/api/coms/timetypes/:id', apiCall(del, {field: 'code', variable: 'id'}, 'timetype'))
}

/*
Treatment for revision control and drop flag.
*/
const extraTreatment = (session, id, isInsert, isDelete, callback) => {
  let db = session.dbs['objects']
  let vc = {property: 'revision', entity: id, value: 1, t1: CT.START_OF_TIME, t2: CT.END_OF_TIME}
  let ts = new Date().getTime()
  let now = moment.tz(ts, 'GMT').format('YYYYMMDD')
  let day = parseInt(now)
  let d = {property: 'drop', entity: id, value: day, t1: CT.START_OF_TIME, t2: CT.END_OF_TIME}
  if (isInsert) {
    db.insert(vc).into('property_num_1').then((rowid) => {
      d.value = 0
      db.insert(d).into('property_num_1').then((rowid) => callback(null, id))
      .catch((err) => callback(err))
    })
    .catch((err) => callback(err))
  } else if (isDelete) {
    db('property_num_1').increment('value', 1)
      .where('entity', id).where('property', 'revision')
      .then((rowid) => {
        db('property_num_1').where('entity', id).where('property', 'drop')
          .then((rowid) => callback(null, id))
          .catch((err) => callback(err))
      })
      .catch((err) => callback(err))
  } else { // Update: increment revision and set drop = 0
    db('property_num_1').increment('value', 1)
      .where('entity', id).where('property', 'revision')
      .then((rowid) => {
        d.value = 0
        db('property_num_1').where('entity', id).where('property', 'drop')
          .update(d)
          .then((rowid) => {
            callback(null, id)
          })
          .catch((err) => callback(err))
      })
      .catch((err) => callback(err))
  }
}

/*
Indicates something has changed, so the terminals should be updated
*/
const nextVersion = (session, obj, type) => {
  // logger.debug('nextVersion')
  // logger.debug(obj)
  if (type !== 'record') return
  // Get current object state in database
  squeries.get(session, {id: obj[0]},
    {
      _entity_: 'record',
      _filter_: {field: 'id', variable: 'id'},
      code: 'code',
      version: {_property_: 'revision'},
      drop: {_property_: 'drop'},
      card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
    },
    (err, ret) => {
      if (err) logger.error(err)
      else {
        let code = parseInt(ret.code)
        let cardList
        if (ret) {
          logger.debug(ret)
          cardList = ret.card
          if (cardList) {
            for (let i = 0; i < cardList.length; i++) {
              if (ret.code) {
                comsService.globalSend('record_insert', {records: {id: code}})
                comsService.globalSend('card_insert', {cards: [{card: cardList[i].code, id: code}]})
              }
            }
          } else {
            comsService.globalSend('record_delete', {records: {id: code}})
          }
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
        squeries.put(session, stateService, {}, prepPutClocking, clocking, callback)
        // inputsService.createClocking(clocking, customer, callback)
      }
    })
}

const createSession = (customer) => {
  let ts = new Date().getTime()
  let now = moment.tz(ts, 'GMT').format('YYYYMMDDHHmmss')
  let session = {
    name: customer,
    dbs: main.getDatabases(customer),
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
  initAPI: initAPI,
  initTerminal: initTerminal,
  createClocking: createClocking,
  getPendingRegisters: getPendingRegisters
}

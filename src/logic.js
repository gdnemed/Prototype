/* global require, process */
// -------------------------------------------------------------------------------------------
// Lemuria logic.
// -Implements API calls.
// -Manages upload to terminals.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require('./utils/log')
const squeries = require('./objects/squeries')
const CT = require('./CT')
const utils = require('./utils/utils')
const httpServer = require('./httpServer')
const inputsMigrations = require('../db/migrations/inputs/inputs_migration')
const g = require('./global')

let sessionService, stateService, comsService, log

let prepGetRecords = {
  _entity_: '[record]',
  _filter_: {field: 'drop', value: CT.END_OF_TIME},
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
  _filter_: {field: 'drop', value: CT.END_OF_TIME},
  name: 'name',
  code: 'code',
  text: 'intname',
  groups: {_property_: '[ttgroup]', _field_: 'value'}
}

let prepGetTimeType = {
  _entity_: 'timetype',
  _filter_: {field: 'code', variable: 'id'},
  code: 'code',
  text: 'intname',
  groups: {_property_: '[ttgroup]', code: 'value'}
}

let prepPutTimeType = {
  _entity_: 'timetype',
  code: 'code',
  text: 'intname',
  groups: {_property_: '[ttgroup]', _mixed_: true}
}

let prepPutEnroll = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
  _subput_: {
    _property_: 'enroll',
    enroll: 't2'
  }
}

let prepGetInfo = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
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
  _subput_: {
    _property_: 'info',
    value: 'value',
    date: 't1'
  }
}

/*
Adapts database data of clocking to API structure.
*/
const transformClocking = (c) => {
  c.date = Math.trunc(c.tmp / 1000000)
  c.time = c.tmp % 1000000
  delete c.tmp
  switch (c.result) {
    case 0: c.result = 'E00'
      break
    case 1: c.result = 'E02'
      break
    default: delete c.result
  }
}

let prepGetClockings = {
  _inputs_: '201708', // TODO: what if new clockings in very past of very future tables?
  _filter_: {field: 'id', condition: '>', variable: 'fromid'},
  _order_: [{column: 'id'}],
  id: 'id',
  tmp: 'tmp',
  card: {_property_: 'card'},
  record: {_property_: 'record'},
  result: 'result',
  _transform_: transformClocking
}

let prepGetClockingsDebug = {
  _inputs_: '201708',
  id: 'id',
  tmp: 'tmp',
  gmt: 'gmt',
  card: {_property_: 'card'},
  record: {_property_: 'record'},
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

const init = (sessions, state, coms) => {
  log = logger.getLogger('logic')
  log.debug('>> logic.init()')
  sessionService = sessions
  stateService = state
  comsService = coms
  initAPI()
  return Promise.resolve()
}

const get = (req, res, session, str) => {
  squeries.get(session, req.query, str, (err, ret) => {
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
        if (!Array.isArray(ret)) ret = [ret]
        res.status(200).jsonp(ret)
        nextVersion(session, ret, str._entity_)// Notify communications
      }
    })
}

const del = (req, res, session, filter, entity) => {
  // We don't really delete, we just put a value in 'drop'
  let str = {_entity_: entity,
    drop: {_property_: 'drop'},
    id: filter.field
  }
  squeries.put(session, stateService, req.params, str,
    {drop: utils.now(), id: req.params[filter.variable]}, null, (err, rows) => {
      if (err) res.status(500).end(err.message)
      else {
        res.status(200).end()
        nextVersion(session, [rows], str._entity_)// Notify communications
      }
    })
}

const apiCall = (op, param1, param2) => {
  return (req, res) => sessionService.manageSession(req, res,
    (req, res, session) => op(req, res, session, param1, param2))
}

const initAPI = () => {
  let api = httpServer.getApi()
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
  api.post('/api/coms/timetypes', apiCall(put, prepPutTimeType))
  api.post('/api/coms/timetypes/:id', apiCall(put, prepPutTimeType))
  api.delete('/api/coms/timetypes/:id', apiCall(del, {field: 'code', variable: 'id'}, 'timetype'))
  api.post('/api/coms/clean', clean)
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
      d.value = CT.END_OF_TIME
      db.insert(d).into('property_num_1').then((rowid) => callback(null, id))
      .catch((err) => callback(err))
    })
    .catch((err) => callback(err))
  } else if (isDelete) {
  } else { // Update: increment revision and set drop = 0
    db('property_num_1').increment('value', 1)
      .where('entity', id).where('property', 'revision')
      .then((rowid) => {
        db('property_num_1').where('entity', id).where('property', 'drop')
          .update({value: CT.END_OF_TIME})
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
  // log.debug('nextVersion')
  // log.debug(obj)
  if (type !== 'record') {
    g.getEventEmitter().emit(g.EVT.onEntityVersionChange)
    return
  }
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
      if (err) log.error(err)
      else if (ret) {
        let code = parseInt(ret.code)
        let cardList
        if (ret) {
          log.debug('Next version:')
          log.debug(ret)
          if (ret.code) {
            comsService.globalSend(ret.drop === 0 ? 'record_insert' : 'record_delete', {records: [{id: code}]})
            cardList = ret.card
            if (cardList) {
              for (let i = 0; i < cardList.length; i++) {
                comsService.globalSend(ret.drop === 0 ? 'card_insert' : 'card_delete', {
                  cards: [{
                    card: cardList[i].code,
                    id: code
                  }]
                })
              }
            }
          }
          g.getEventEmitter().emit(g.EVT.onEntityVersionChange)
        }
      }
    })
}

/*
Uploads into the terminal, every information with higher revision.
*/
const initTerminal = (serial, customer) => {
  // Until upload is completely implemented, we clean terminal every time it connects
  comsService.send(serial, 'card_delete_complete', null)
  comsService.send(serial, 'record_delete_complete', null)
  // Go to DB to get records
  sessionService.getSession(customer)
    .then((session) => {
      squeries.get(session, {},
        {
          _entity_: '[record]',
          _filter_: {field: 'revision', condition: '>', value: 0},
          code: 'code',
          drop: {_property_: 'drop'},
          card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
        }, (err, ret) => {
          if (err) log.error(err)
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
    })
    .catch((err) => log.error(err))
}

const createClocking = (clocking, customer, callback) => {
  sessionService.getSession(customer)
    .then((session) => {
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
            squeries.put(session, stateService, {}, prepPutClocking, clocking, null, callback)
            // inputsService.createClocking(clocking, customer, callback)
          }
        })
    })
    .catch(callback)
}

/*
Deletes every entity with drop property too old.
*/
const clean = (req, res) => {
  sessionService.manageSession(req, res,
    (req, res, session) => {
      stateService.getSettings(session)
        .then((settings) => {
          cleanRecords(settings, session)
            .then(() => cleanInputs(settings, session))
            .then(res.status(200).end())
            .catch((err) => res.status(500).end(err.message))
        })
        .catch((err) => res.status(500).end(err.message))
    })
}

const cleanRecords = (settings, session) => {
  return new Promise((resolve, reject) => {
    let daysRecords = settings.daysRecords ? parseInt(settings.daysRecords) : 30
    let limit = utils.tsToTime(new Date().getTime() - (86400000 * daysRecords)) // Just for test
    let str = {
      _entity_: '[]',
      _filter_: {field: 'drop', value: limit, condition: '<'},
      id: 'id'
    }
    // First, we get every old entity
    squeries.get(session, {}, str, (err, ret) => {
      if (err) reject(err)
      else {
        // Now, iterate to delete them
        if (ret) delRecord(ret, session, 0).then(resolve).catch(reject)
        else resolve()
      }
    })
  })
}

const delRecord = (records, session, i) => {
  return new Promise((resolve, reject) => {
    if (i >= records.length) resolve()
    else {
      squeries.del(session, records[i].id, true, null, null, (err, rows) => {
        if (err) reject(err)
        else delRecord(records, session, i).then(resolve).catch(reject)
      })
    }
  })
}

const cleanInputs = (settings, session) => {
  return new Promise((resolve, reject) => {
    let monthsInputs = settings.monthsInputs ? parseInt(settings.monthsInputs) : 12
    let now = utils.momentNow().subtract(monthsInputs, 'months')
    let ym = now.format('YYYYMM')
    let year = ym.substr(0, 4)
    let month = ym.substr(4, 6)
    let db = session.dbs['inputs' + year]
    if (db) {
      if (db.months[month]) {
        inputsMigrations.downMonth(db.schema, ym)
        resolve()
      } else resolve()
    } else resolve()
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
  init,
  initAPI,
  initTerminal,
  createClocking,
  getPendingRegisters
}

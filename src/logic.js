/* global require, process */
// -------------------------------------------------------------------------------------------
// Lemuria logic.
// -Implements API calls.
// -Manages upload to terminals.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const logger = require('./utils/log')
const squeries = require('./objects/squeries')
const select = require('./objects/selects')
const CT = require('./CT')
const utils = require('./utils/utils')
const httpServer = require('./httpServer')
const migrations = require('./migrations')
const inputsMigrations = require('./db/migrations/inputs/inputs_migration')
const g = require('./global')
const sseExpress = require('sse-express')
const onFinished = require('on-finished')

let sessionService, stateService, comsService, log

let prepGetRecords = {
  _entity_: '[record]',
  _filter_: {field: 'drop', value: CT.END_OF_TIME},
  name: 'name',
  id: 'document',
  code: 'code',
  pin: {_property_: 'pin'},
  seclevel: {_property_: 'seclevel'},
  language: {_property_: 'language'},
  validity: {_property_: '[validity]', start: 't1', end: 't2'},
  timetype_grp: {_property_: '[ttgroup]', code: 'value', start: 't1', end: 't2'},
  card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
}

let prepGetRecord = {
  _entity_: 'record',
  _filter_: {field: 'document', variable: 'id'},
  name: 'name',
  pin: {_property_: 'pin'},
  seclevel: {_property_: 'seclevel'},
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
  pin: {_property_: 'pin'},
  seclevel: {_property_: 'seclevel'},
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

let prepGetNodes = {
  _entity_: '[node]',
  id: 'code',
  services: {
    _relation_: '[<-runsIn]',
    _field_: 'code'
  }
}

let prepGetNode = {
  _entity_: 'node',
  _filter_: {field: 'code', variable: 'id'},
  id: 'code',
  services: {
    _relation_: '[<-runsIn]',
    id: 'code',
    dir: {_property_: 'dir'},
    period: {_property_: 'period'},
    fileName: {_property_: 'fileName'},
    workdir: {_property_: 'workdir'},
    output: {_property_: 'output'},
    deleteFile: {_property_: 'deleteFile'}
  }
}

let prepPutNode = {
  _entity_: 'node',
  id: 'code'
}

let prepGetServices = {
  _entity_: 'node',
  _related_: {
    _relation_: '[<-runsIn]',
    id: 'code',
    dir: {_property_: 'dir'},
    period: {_property_: 'period'},
    fileName: {_property_: 'fileName'},
    workdir: {_property_: 'workdir'},
    output: {_property_: 'output'},
    deleteFile: {_property_: 'deleteFile'}
  },
  _filter_: {field: 'code', variable: 'id'}
}

let prepGetService = {
  _entity_: 'node',
  _related_: {
    _relation_: '<-runsIn',
    _filter_: {field: 'code', variable: 'svc'},
    code: 'code',
    dir: {_property_: 'dir'},
    period: {_property_: 'period'},
    fileName: {_property_: 'fileName'},
    workdir: {_property_: 'workdir'},
    output: {_property_: 'output'},
    deleteFile: {_property_: 'deleteFile'}
  },
  _filter_: {field: 'code', variable: 'id'}
}

let prepPutService = {
  _entity_: 'node',
  _filter_: {field: 'code', variable: 'id'},
  services: {
    _relation_: '[runsIn<-service]',
    svc: 'code',
    dir: {_property_: 'dir'},
    period: {_property_: 'period'},
    fileName: {_property_: 'fileName'},
    workdir: {_property_: 'workdir'},
    output: {_property_: 'output'}
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
  _inputs_: 'now', // TODO: what if new clockings in very past of very future tables?
  _filter_: {field: 'id', condition: '>', variable: 'fromid'},
  _order_: [{column: 'id'}],
  id: 'id',
  tmp: 'tmp',
  result: 'result',
  card: {_property_: 'card'},
  code: {_property_: 'record'},
  record: {_relation_: 'owner', _field_: 'document'},
  _transform_: transformClocking
}

let prepGetClockingsDebug = {
  _inputs_: 'now',
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
  if (g.getConfig().api_listen) {
    log = logger.getLogger('logic')
    log.debug('>> logic.init()')
    sessionService = sessions
    stateService = state
    comsService = coms
    initAPI()
  }
  return Promise.resolve()
}

const test = (req, res, session) => {
  select.get(session, {}, req.body)
    .then((ret) => res.status(200).jsonp(ret))
    .catch((err) => res.status(500).end(err.stack.toString()))
}

const get = (req, res, session, str) => {
  // We add parameters from url into variables set
  if (req.params) {
    if (!req.query) req.query = {}
    for (var p in req.params) {
      if (req.params.hasOwnProperty(p)) req.query[p] = req.params[p]
    }
  }
  log.info(`GET ${req.url} params: ${JSON.stringify(req.query)}`)
  let cloned = JSON.parse(JSON.stringify(str))
  if (str._transform_) cloned._transform_ = str._transform_
  // squeries.get(session, req.query, cloned)
  select.get(session, req.query, cloned)
    .then((ret) => res.status(200).jsonp(ret))
    .catch((err) => res.status(500).end(err.stack.toString()))
}

const put = (req, res, session, str) => {
  log.info(`POST ${req.url} params: ${JSON.stringify(req.params)} body: ${JSON.stringify(req.body)}`)
  let cloned = JSON.parse(JSON.stringify(str))
  if (str._transform_) cloned._transform_ = str._transform_
  squeries.put(session,
    stateService,
    req.params,
    cloned, req.body, extraTreatment)
    .then((ret) => {
      if (!Array.isArray(ret)) ret = [ret]
      res.status(200).jsonp(ret)
      nextVersion(session, ret, str._entity_)// Notify communications
    })
    .catch((err) => {
      res.status(500).end(err.stack.toString())
    })
}

const del = (req, res, session, filter, entity) => {
  log.info(`DEL ${req.url} params: ${JSON.stringify(req.params)}`)
  // We don't really delete, we just put a value in 'drop'
  let str = {_entity_: entity,
    drop: {_property_: 'drop'},
    id: filter.field
  }
  squeries.put(session, stateService, req.params, str,
    {drop: utils.now(), id: req.params[filter.variable]}, null)
    .then((rows) => {
      res.status(200).end()
      nextVersion(session, [rows], str._entity_)// Notify communications
    })
    .catch((err) => res.status(500).end(err.stack.toString()))
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
  api.get('/api/coms/asap', sseExpress, apiCall(register))
  api.post('/api/test', apiCall(test))
  api.get('/api/nodes', apiCall(get, prepGetNodes))
  api.get('/api/nodes/:id', apiCall(get, prepGetNode))
  api.post('/api/nodes', apiCall(put, prepPutNode))
  api.post('/api/nodes/:id', apiCall(put, prepPutNode))
  api.get('/api/nodes/:id/services', apiCall(get, prepGetServices))
  api.get('/api/nodes/:id/services/:svc', apiCall(get, prepGetService))
  api.post('/api/nodes/:id/services', apiCall(put, prepPutService))
  api.post('/api/nodes/:id/services/:svc', apiCall(put, prepPutService))
}

let monitors = {}

const register = (req, res, session) => {
  let customer = session.name
  let monitorsList = monitors[customer]
  if (!monitorsList) {
    monitorsList = []
    monitors[customer] = monitorsList
  }
  let client = {
    session: session,
    req: req,
    res: res
  }
  monitorsList.push(client)
  onFinished(res, () => monitorsList.remove(client))
  // If it has an identifier, get configuration and send it
  if (req.query && req.query.id) {
    let found = 0
    for (let i = 0; i < monitorsList; i++) {
      let q = monitorsList[i].req.query
      if (q && q.id && q.id === req.query.id) found++
    }
    if (found > 1) {
      res.status(500).end('id conflict')
    } else {
      let cloned = JSON.parse(JSON.stringify(prepGetNode))
      squeries.get(session, req.query, cloned)
        .then((ret) => res.sse('config', ret))
        .catch((err) => res.status(500).end(err.message))
    }
  }
}

/*
Treatment for revision control and drop flag.
*/
const extraTreatment = (session, id, isInsert, isDelete) => {
  return new Promise((resolve, reject) => {
    let db = session.dbs['objects']
    let vc = {property: 'revision', entity: id, value: 1, t1: CT.START_OF_TIME, t2: CT.END_OF_TIME}
    let ts = new Date().getTime()
    let now = moment.tz(ts, 'GMT').format('YYYYMMDD')
    let day = parseInt(now)
    let d = {property: 'drop', entity: id, value: day, t1: CT.START_OF_TIME, t2: CT.END_OF_TIME}
    if (isInsert) {
      db.insert(vc).into('property_num_1')
        .then((rowid) => {
          d.value = CT.END_OF_TIME
          db.insert(d).into('property_num_1')
            .then((rowid) => resolve(id))
            .catch(reject)
        })
        .catch(reject)
    } else if (isDelete) {
    } else { // Update: increment revision and set drop = 0
      db('property_num_1').increment('value', 1)
        .where('entity', id).where('property', 'revision')
        .then((rowid) => {
          db('property_num_1').where('entity', id).where('property', 'drop')
            .update({value: CT.END_OF_TIME})
            .then((rowid) => resolve(id))
            .catch(reject)
        })
        .catch(reject)
    }
  })
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
    })
    .then((ret) => {
      let code = parseInt(ret.code)
      let cardList
      if (ret) {
        log.debug('Next version:')
        log.debug(ret)
        if (ret.code) {
          // For TODO's: t1 and t2 should be checked against local timezone of each device!
          // TODO: Should we check valid dates of record to do delete/insert?
          comsService.globalSend(ret.drop === CT.END_OF_TIME ? 'record_insert' : 'record_delete', {records: [{id: code}]})
          cardList = ret.card
          if (cardList) {
            for (let i = 0; i < cardList.length; i++) {
              // TODO: Should we check t1 and t2 to do delete/insert?
              comsService.globalSend(ret.drop === CT.END_OF_TIME ? 'card_insert' : 'card_delete', {
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
    })
    .catch((err) => log.error(err))
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
          _filter_: {field: 'drop', value: CT.END_OF_TIME},
          code: 'code',
          drop: {_property_: 'drop'},
          card: {_relation_: '[<-identifies]', code: 'code', start: 't1', end: 't2'}
        })
        .then((ret) => {
          for (let i = 0; i < ret.length; i++) {
            if (ret[i].code && ret[i].code !== null) {
              let r = {id: parseInt(ret[i].code), seclevel: ret[i].seclevel, pin: ret[i].pin}
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
        })
        .catch((err) => log.error(err))
    })
    .catch((err) => log.error(err))
}

/*
Seeks the owner of the clocking and calls validate() to get a response.
Then, stores the clocking into DB and resolves with the complete clocking object.
*/
const createClocking = (clocking, customer) => {
  return new Promise((resolve, reject) => {
    sessionService.getSession(customer)
      .then((session) => {
        // Find the owner
        squeries.get(session, {record: clocking.record},
          {
            _entity_: 'record',
            id: 'id',
            document: 'document',
            _filter_: {field: 'code', variable: 'record'}
          })
          .then((record) => {
            if (record) {
              clocking.owner = record.id
              clocking.document = record.document
            }
            validate(clocking)
              .then((clocking) => {
                squeries.put(session, stateService, {}, prepPutClocking, clocking, null)
                  .then((id) => {
                    notifyMonitors(clocking, id, customer)
                    resolve(clocking)
                  })
                  .catch(reject)
              })
              .catch(reject)
          })
          .catch(reject)
      })
      .catch(reject)
  })
}

/*
Clocking processing. It adds a response, to send to device.
*/
const validate = (clocking) => {
  return Promise.resolve(clocking)
}

const notifyMonitors = (clocking, id, customer) => {
  let c = {
    result: clocking.result,
    tmp: clocking.tmp,
    id: id
  }
  if (clocking.card) c.card = clocking.card
  if (clocking.record) c.code = clocking.record
  if (clocking.document) c.record = clocking.document
  transformClocking(c)
  let list = monitors[customer]
  if (list) {
    for (let i = 0; i < list.length; i++) list[i].res.sse('clocking', c)
  }
}

/*
Deletes every entity with drop property too old.
*/
const clean = (req, res) => {
  sessionService.manageSession(req, res,
    (req, res, session) => {
      stateService.getSettings(session)
        .then((settings) => {
        // Just return OK and start clean process
          res.status(200).end()
          cleanRecords(settings, session)
          cleanInputs(settings, session)
          createFutureMonthInputs(session)
        })
        .catch((err) => res.status(500).end(err.message))
    })
}

/*
Deletes old records (drop property beyond settings.daysRecords)
*/
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
    squeries.get(session, {}, str)
      .then((ret) => {
        // Now, iterate to delete them
        if (ret) delRecord(ret, session, 0).then(resolve).catch(reject)
        else resolve()
      })
      .catch(reject)
  })
}

const delRecord = (records, session, i) => {
  return new Promise((resolve, reject) => {
    if (i >= records.length) resolve()
    else {
      squeries.del(session, records[i].id, true, null, null)
        .then((rows) => {
          delRecord(records, session, i).then(resolve).catch(reject)
        })
      .catch(reject)
    }
  })
}

/*
Drops tables containing old inputs (beyond settings.monthsInputs)
*/
const cleanInputs = (settings, session) => {
  // Get DB type from current db
  let db = session.dbs['inputs' + new Date().getFullYear()]
  if (!db) return Promise.resolve()
  let type = db.client.config.client
  let path = db.client.config.connection.filename
  // Go back in time
  let monthsInputs = settings.monthsInputs ? parseInt(settings.monthsInputs) : 12
  let now = utils.momentNow().subtract(monthsInputs, 'months')
  // Check if previous year still connected, and disconnect
  let prevYear = (now.year() - 1)
  let section = 'inputs' + prevYear
  db = session.dbs[section]
  if (db) { // Destroy connection
    db.destroy()
    delete session.dbs[section]
  } else if (type === 'sqlite3') {
    // If sqlite, try to destroy file for previous disconnected DB
    path = path.substr(0, path.length - 7) + prevYear + '.db'
    inputsMigrations.cleanFileDB(path, type)
      .then(() => {}) // No more work to do
      .catch((err) => log.error(err))
  }
  // Now, drop every table in year, previous to now
  return cleanMonthInputs(type, now, session, 0)
}

/*
Recursively drops inputs tables until 1 year before the limit.
*/
const cleanMonthInputs = (type, now, session, i) => {
  return new Promise((resolve, reject) => {
    now = now.subtract(1, 'months')
    let ym = now.format('YYYYMM')
    let year = ym.substr(0, 4)
    let month = ym.substr(4, 6)
    // If we get december of previous year, work done
    if (month === '12' && i > 0) resolve()
    else {
      let db = session.dbs['inputs' + year]
      if (!db) {
        // Connection to DB still not established. Try to connect before clean.
        migrations.connect(type, false, session.name, 'inputs', session.dbs, parseInt(year))
          .then((section) => {
            if (section) return inputsMigrations.verifyYear(session.dbs, year, log)
            else return Promise.resolve() // DB not exist, not necessary to do work
          })
          .then(() => {
            db = session.dbs['inputs' + year]
            if (db) {
              inputsMigrations.downMonth(db, ym)
                .then(() => cleanMonthInputs(type, now, session, i + 1))
                .catch(reject)
            } else resolve()
          })
          .catch(reject)
      } else {
        // Database exists. Clean month and call ourselves recursively
        inputsMigrations.downMonth(db, ym)
          .then(() => cleanMonthInputs(type, now, session, i + 1))
          .catch(reject)
      }
    }
  })
}

/*
Recursively creates monthly inputs tables for future inputs.
*/
const createFutureMonthInputs = (session) => {
  let year = new Date().getFullYear()
  let db = session.dbs['inputs' + year]
  // We'll probably have a connection for current year. If not, do nothing
  if (db) {
    let type = db.client.config.client
    year = year + 1
    db = session.dbs['inputs' + year]
    if (!db) {
      // Database still not exists, let's create it now
      migrations.initYear(type, session.name, year, session.dbs)
        .then(() => log.info(`Future inputs tables created for ${session.name}, year ${year}`))
        .catch((err) => log.error(err))
    }
  }
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

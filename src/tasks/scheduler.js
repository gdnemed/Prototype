// -------------------------------------------------------------------------------------------
// Scheduler for programmed tasks.
// -------------------------------------------------------------------------------------------
const request = require('request')
const logger = require('../utils/log')
const g = require('../global')

let log, remoteService, sessionsService

let programmedTasks = {
  cleanDB: {
    hour: 9,
    minute: 0,
    customer: 'SPEC',
    call: {method: 'POST', path: '/api/coms/clean'}
  }
}

const init = (sessions) => {
  remoteService = g.getConfig().logic
  if (g.isLocalService('scheduler')) {
    log = logger.getLogger('scheduler')
    log.debug('>> scheduler.init()')
    sessionsService = sessions
    setTimeout(checkTasks, 1000)
  }
  return Promise.resolve()
}

let timerCheck
/*
Executes every tasks which time has come, and sets new timer for first future task.
*/
const checkTasks = () => {
  let now = new Date()
  let next
  for (let k in programmedTasks) {
    if (programmedTasks.hasOwnProperty(k)) {
      let t = programmedTasks[k]
      // For every task, check if it was executed this day
      let tExec = new Date(now.getYear(), now.getMonth(), now.getDay(), t.hour, t.minute, 0)
      let lapse = tExec.getTime() - now.getTime()
      if ((!t.lastExecution ||
        t.lastExecution.getYear() !== now.getYear() ||
        t.lastExecution.getMonth() !== now.getMonth() ||
        t.lastExecution.getDay() !== now.getDay()) &&
        now >= tExec) executeTask(t, now)
      // Put new time, if it is less than any other
      if (lapse > 0) {
        if (next) {
          if (lapse < next) next = lapse
        } else next = lapse
      }
    }
  }
  // We program next execution, with the minimum time lapse
  if (next) timerCheck = setTimeout(checkTasks, next)
}

/*
Runs a task asynchronously
*/
const executeTask = (t, now) => {
  t.lastExecution = now
  delete t.endExecution
  if (t.call) {
    let url = 'http://' + remoteService.host + ':' + remoteService.port + t.call.path
    let data = {method: t.call.method, url: url}
    if (sessionsService.setAuthorization(t.customer, data)) {
      if (t.call.content != null) {
        data.json = true
        data.body = t.call.content
      }
      request(data, (error, response, body) => {
        if (error) log.error(error)
        t.endExecution = new Date()
        if (!timerCheck) checkTasks()
      })
    } else {
      log.error('Task for customer ' + t.customer + ' could not be executed: customer not found.')
      if (!timerCheck) checkTasks()
    }
  } else if (!timerCheck) checkTasks()
}

module.exports = {
  init: init
}

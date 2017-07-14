// -------------------------------------------------------------------------------------------
// Generic utilities.
// -------------------------------------------------------------------------------------------

const moment = require('moment-timezone')
const CT = require.main.require('./CT')

const now = (timezone = 'GMT') => {
  return parseInt(moment.tz(new Date().getTime(), timezone).format('YYYYMMDDHHmmss'))
}

const tsToTime = (ts, timezone = 'GMT') => {
  return parseInt(moment.tz(ts, timezone).format('YYYYMMDDHHmmss'))
}

const previousDay = (day) => {
  if (day === CT.START_OF_DAYS) return day
  else {
    let d = [Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100]
    return parseInt(moment(d).subtract(1, 'days').format('YYYYMMDD'))
  }
}

const previousTime = (time) => {
  if (time < CT.START_OF_TIME) return previousDay(time)
  else if (time === CT.START_OF_TIME) return time
  else {
    let d = Math.floor(time / 1000000)
    let h = time % 1000000
    let t = [Math.floor(d / 10000), (Math.floor(d / 100) % 100) - 1, d % 100,
      Math.floor(h / 10000), Math.floor(h / 100) % 100, h % 100]
    return parseInt(moment(t).subtract(1, 'seconds').format('YYYYMMDDHHmmss'))
  }
}

const nextDay = (day) => {
  if (day === CT.END_OF_DAYS) return day
  else {
    let d = [Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100]
    return parseInt(moment(d).add(1, 'days').format('YYYYMMDD'))
  }
}

const nextTime = (time) => {
  if (time < CT.START_OF_TIME) return nextDay(time)
  else if (time === CT.END_OF_TIME) return time
  else {
    let d = Math.floor(time / 1000000)
    let h = time % 1000000
    let t = [Math.floor(d / 10000), (Math.floor(d / 100) % 100) - 1, d % 100,
      Math.floor(h / 10000), Math.floor(h / 100) % 100, h % 100]
    return parseInt(moment(t).add(1, 'seconds').format('YYYYMMDDHHmmss'))
  }
}

module.exports = {
  now: now,
  tsToTime: tsToTime,
  previousDay: previousDay,
  previousTime: previousTime,
  nextDay: nextDay,
  nextTime: nextTime
}

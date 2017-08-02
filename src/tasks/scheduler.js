// -------------------------------------------------------------------------------------------
// Scheduler for programmed tasks.
// -------------------------------------------------------------------------------------------

let programmedTasks = {}

const init = () => {
  setTimeout(checkTasks, 1000)
  return Promise.resolve()
}

/*
Executes every tasks which time has come, and sets new timer for first future task.
*/
const checkTasks = () => {
  let next
  for (let t in programmedTasks) {
    // Nested relation have fields changed to r<i>_<field>
    if (programmedTasks.hasOwnProperty(t)) {
    }
  }
  if (next) setTimeout(checkTasks, next)
}

module.exports = {
  init: init
}

// -------------------------------------------------------------------------------------------
// Module for database updates, over properties and relations.
// -------------------------------------------------------------------------------------------
const MODEL = require('./model')
const CT = require('../CT')
const utils = require('../utils/utils')

let nodeId = 1

const putProperty = (session, stateService, variables, squery, data, extraFunction) => {
  return new Promise((resolve, reject) => {
  })
}

const putRelation = (session, stateService, variables, squery, data, extraFunction) => {
  return new Promise((resolve, reject) => {
  })
}

module.exports = {
  putProperty,
  putRelation
}

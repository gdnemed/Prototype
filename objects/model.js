// -------------------------------------------------------------------------------------------
// Temporal constants, while Model service still doesn't exist
// -------------------------------------------------------------------------------------------

const ENTITIES = {
  'card': {keys: [['code']], required: ['code']},
  'record': {keys: [['code'], ['document']],
    required: ['code', 'document', 'name'],
    related_from: {identifies: 'card'}}
}

const PROPERTIES = {
  'language': {type: 'str', time: false},
  'info': {type: 'str', time: true},
  'enroll': {type: 'num', time: true},
  'validity': {type: 'num', time: false},
  'ttgroup': {type: 'str', time: false},
  'card': {type: 'str'},
  'record': {type: 'str'}
}

const INPUTS = {
  keys: [],
  required: ['tmp', 'source']
}

const RELATIONS = {
  'identifies': {time: false}
}

const getTypeProperty = (p) => {
  return PROPERTIES[p].type
}

const getRelatedEntity = (r, e, inverse) => {
  return inverse ? ENTITIES[e].related_from[r] : ENTITIES[e].related_to[r]
}

module.exports = {
  ENTITIES: ENTITIES,
  PROPERTIES: PROPERTIES,
  RELATIONS: RELATIONS,
  INPUTS: INPUTS,
  getTypeProperty: getTypeProperty,
  getRelatedEntity: getRelatedEntity
}

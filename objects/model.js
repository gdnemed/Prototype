// -------------------------------------------------------------------------------------------
// Temporal constants, while Model service still doesn't exist
// -------------------------------------------------------------------------------------------

const ENTITIES = {
  'card': {keys: ['code']},
  'record': {keys: ['code', 'document'],
    related_from: {identifies: 'card'}}
}

const PROPERTIES = {
  'language': {type: 'str'},
  'info': {type: 'str'},
  'enroll': {type: 'num'},
  'validity': {type: 'num'},
  'ttgroup': {type: 'str'},
  'card': {type: 'str'},
  'record': {type: 'str'}
}

const RELATIONS = {
  'identifies': {}
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
  getTypeProperty: getTypeProperty,
  getRelatedEntity: getRelatedEntity
}

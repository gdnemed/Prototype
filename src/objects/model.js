// -------------------------------------------------------------------------------------------
// Temporal constants, while Model service still doesn't exist
// -------------------------------------------------------------------------------------------

const ENTITIES = {
  'card': {
    keys: [['code']],
    required: ['code']
  },
  'record': {
    keys: [['document'], ['code']],
    required: ['code', 'document', 'name'],
    related_from: {identifies: 'card'}
  },
  'timetype': {
    keys: [['code']],
    required: ['code', 'intname']
  },
  'node': {
    keys: [['code']],
    required: ['code'],
    related_from: {runsIn: 'service'}
  },
  'service': {
    keys: [['code']],
    required: ['code']
  }
}

const PROPERTIES = {
  'language': {type: 'string', time: false},
  'info': {type: 'string', time: false},
  'enroll': {type: 'datetime', time: true},
  'validity': {type: 'datetime', time: false},
  'ttgroup': {type: 'string', time: false},
  'revision': {type: 'number', time: true},
  'drop': {type: 'datetime', time: true},
  'card': {type: 'string'},
  'record': {type: 'string'},
  'seclevel': {type: 'number', time: false},
  'pin': {type: 'string', time: false},
  'host': {type: 'string'},
  'port': {type: 'number'},
  'dir': {type: 'string'},
  'workdir': {type: 'string'},
  'output': {type: 'boolean'},
  'period': {type: 'number'},
  'fileName': {type: 'string'}

}

const INPUTS = {
  keys: [],
  required: ['tmp', 'source']
}

const RELATIONS = {
  'identifies': {type: 'N->1', time: false},
  'runsIn': {type: 'N->1', time: false}
}

const getTypeProperty = (p) => {
  return getType(PROPERTIES[p].type)
}

const getType = (t) => {
  switch (t) {
    case 'string': return 'str'
    case 'number': return 'num'
    case 'blob': return 'bin'
    case 'boolean': return 'num'
    case 'date': return 'num'
    case 'datetime': return 'num'
    case 'time': return 'num'
  }
}

const getRelatedEntity = (r, e, inverse) => {
  return inverse ? ENTITIES[e].related_from[r] : ENTITIES[e].related_to[r]
}

module.exports = {
  ENTITIES,
  PROPERTIES,
  RELATIONS,
  INPUTS,
  getType,
  getTypeProperty,
  getRelatedEntity
}

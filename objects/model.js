// -------------------------------------------------------------------------------------------
// Temporal constants, while Model service still doesn't exist
// -------------------------------------------------------------------------------------------

const getTypeProperty = (p) => {
  return module.exports.PROPERTIES[p].type
}

module.exports = {

  PROPERTIES: {
    'language': {type: 'str'},
    'info': {type: 'str'},
    'enroll': {type: 'num'},
    'validity': {type: 'num'},
    'ttgroup': {type: 'str'}
  },
  RELATIONS: {
    'identifies': {}
  },
  getTypeProperty: getTypeProperty

}

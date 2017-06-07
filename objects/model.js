// -------------------------------------------------------------------------------------------
// Temporal constants, while Model service still doesn't exist
// -------------------------------------------------------------------------------------------
function get_type_property (p) {
  return module.exports.PROPERTIES[p].type
}

module.exports = {

  PROPERTIES: {
    'language': {type: 'str'},
    'info': {type: 'str'},
    'enroll': {type: 'num'}
  },
  RELATIONS: {
    'identifies': {}
  },
  get_type_property: get_type_property

}

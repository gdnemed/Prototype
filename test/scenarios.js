
const rec1 = {
  'id': '1U_1C',
  'name': '1U_1C Alba Maria Estany',
  'code': '0455',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'TT_1U_1C'}],
  'card': [{'code': 'CARD_CODE_1U_1C', 'start': 20170105, 'end': 20170822}]
}

const createSc1 = (t) => {
  return new Promise((resolve, reject) => {
    t.sendPOST('/api/coms/records', rec1, false)
      .then(() => {
        resolve()
      })
      .catch((err) => {
        console.log('Error creating scenario 1')
        console.log(err)
        reject(err)
      })
  })
}

module.exports = {
  createSc1
}

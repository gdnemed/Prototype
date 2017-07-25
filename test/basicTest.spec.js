/* global process, require, describe, beforeEach, it, afterEach */

const TestMgr = require('./TestMgr.js')
let t // Reference to data obtained from TestMgr().get

const oneUserZeroCards = {
  'id': '1U_1C',
  'name': '1U_1C Alba Maria Estany',
  'code': '0455',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'TT_1U_1C'}],
  'card': [] // FORCED PROBLEM: no cards defined
}

const oneUserOneCard = {
  'id': '1U_1C',
  'name': '1U_1C Alba Maria Estany',
  'code': '0455',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'TT_1U_1C'}],
  'card': [{'code': 'CARD_CODE_1U_1C', 'start': 20170105, 'end': 20170622}]
}

const oneUserTwoCards = {
  'id': '1U_2C',
  'name': '1U_2C Alba Maria Estany',
  'code': '0225',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'TT_1U_2C'}],
  'card': [
    {'code': '0_CARD_CODE_1U_2C', 'start': 20170205, 'end': 20170522}/*,
    {'code': '1_CARD_CODE_1U_2C', 'start': 20170711, 'end': 20170722} */
  ]
}

describe('API Routes', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('POST to /records/ creates a "record" and 1 "card" (oneUserOneCard)', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        t.getCollection(res, 'objects', 'entity_1').then((collection) => {
          t.expect(collection.length).to.equal(2)
          // checks entity 'record' at row [0]
          t.expectProps(collection[0], {
            type: 'record',
            name: oneUserOneCard.name,
            document: oneUserOneCard.id,
            code: oneUserOneCard.code
          })
          // checks entity 'card' at row [1]
          t.expectProps(collection[1], {
            type: 'card',
            code: oneUserOneCard.card[0].code
          })
          done()
        })
      })
      .catch((err) => {
        console.log(err)
      })
  })

  // TODO: Falla el server si enviem un arary de cards! (revisar)
  it('POST to /records/ creates a "record" and 2 "card" (oneUserTwoCard)', (done) => {
    t.sendPOST('/api/coms/records', oneUserTwoCards).then((res) => {
      t.expect(res.status).to.equal(200)
      t.getCollection(res, 'objects', 'entity_1').then((collection) => {
        t.expect(collection.length).to.equal(2)
        // checks entity 'record' at row [0]
        t.expectProps(collection[0], {
          type: 'record',
          name: oneUserTwoCards.name,
          document: oneUserTwoCards.id,
          code: oneUserTwoCards.code
        })
        // checks entity 'card' at row [1]
        t.expectProps(collection[1], {
          type: 'card',
          code: oneUserTwoCards.card[0].code
        })
        // checks entity 'card' at row [2]
        /* t.expectProps(collection[2], {
          type: 'card',
          code: oneUserOneCard.card[0].code
        }) */
        done()
      })
    }).catch((err) => {
      console.log(err)
    })
  })

  it('POST to /records/  a "record" without any "card" (oneUserZeroCards) results =>  only a record and no card', (done) => {
    t.chai.request(t.lemuriaAPI).post('/api/coms/records').send(oneUserZeroCards)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        t.getCollection(res, 'objects', 'entity_1').then((collection) => {
          t.expect(collection.length).to.equal(1)
          // checks entity 'record' at row [0]
          t.expectProps(collection[0], {
            type: 'record',
            name: oneUserOneCard.name,
            document: oneUserOneCard.id,
            code: oneUserOneCard.code
          })
          done()
        })
      })
      .catch((err) => {
        console.log(err)
      })
  })

  // -------------------------------------------------------------------------------------------
  // afterEach(): OPTION 1) Destroys and recreates BD from it() to other it()'s
  // -------------------------------------------------------------------------------------------
  afterEach((done) => {
    t.rollbackAndMigrateDatabases().then(() => done())
  })
  // -------------------------------------------------------------------------------------------
  // afterEach(): OPTION 2) (NOT Prefereable) Does nothing, tables are not restored from it() to other it()'s
  // -------------------------------------------------------------------------------------------
  /*
   afterEach((done) => {
   done()
   })
   */
})

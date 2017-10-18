/* global process, require, describe, beforeEach, it, afterEach */

const TestMgr = require('../../TestMgr.js')
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
  'card': [{'code': 'CARD_CODE_1U_1C', 'start': 20170105, 'end': 20170822}]
}

const oneUser2OneCard = {
  'id': '1U_1C',
  'name': '1U_1C José Ariño',
  'code': '0456',
  'language': 'en',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'TT_1U2_1C'}],
  'card': [{'code': 'CARD_CODE_1U_1C', 'start': 20170105, 'end': 20170822}]
}

const oneUserWithSecLevelAndPIN = {
  'id': '1U_SL_PIN',
  'name': '1U_SL_PIN José Ariño',
  'code': '0456',
  'language': 'en',
  'seclevel': 2,
  'pin': 1234,
  'validity': [{'start': 20170105, 'end': 20180622}]
}

const oneUserTwoCards = {
  'id': '1U_2C',
  'name': '1U_2C Alba Maria Estany',
  'code': '0225',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'TT_1U_2C'}],
  'card': [
    {'code': '0_CARD_CODE_1U_2C', 'start': 20170205, 'end': 20170522},
    {'code': '1_CARD_CODE_1U_2C', 'start': 20170711, 'end': 20170722}
  ]
}

describe('records.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('POST to /records/ creates a "record" and 1 "card" (oneUserOneCard) and checks database', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        t.getCollection('objects', 'entity_1').then((collection) => {
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
      }).catch((e) => {
        if (e.response) console.log('ERROR: ' + e.response.status + ' ' + e.response.text)
        else console.log.error(e)
      })
  })

  it('POST to /records/ creates a "record" with security level and PIN and checks database', (done) => {
    t.sendPOST('/api/coms/records', oneUserWithSecLevelAndPIN)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/records').then((res) => {
          t.expect(res.status).to.equal(200)
          console.log(res.body)
          let rec0 = res.body[0]
          t.expectProps(rec0, {
            name: oneUserWithSecLevelAndPIN.name,
            id: oneUserWithSecLevelAndPIN.id,
            code: oneUserWithSecLevelAndPIN.code,
            pin: oneUserWithSecLevelAndPIN.pin,
            seclevel: oneUserWithSecLevelAndPIN.seclevel
          })
          done()
        })
      }).catch((e) => {
        if (e.response) console.log('ERROR: ' + e.response.status + ' ' + e.response.text)
        else console.log.error(e)
      })
  })

  it('POST to /records/ creates a "record" and 2 "card" (oneUserTwoCard) and checks database', (done) => {
    t.sendPOST('/api/coms/records', oneUserTwoCards).then((res) => {
      t.expect(res.status).to.equal(200)
      t.getCollection('objects', 'entity_1').then((collection) => {
        t.expect(collection.length).to.equal(3)
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
        t.expectProps(collection[2], {
          type: 'card',
          code: oneUserTwoCards.card[1].code
        })
        done()
      })
    }).catch(({response}) => {
      console.log('ERROR: ' + response.status + ' ' + response.text)
    })
  })

  it('POST to /records/  a "record" without any "card" (oneUserZeroCards) results =>  only a record and no card', (done) => {
    t.sendPOST('/api/coms/records', oneUserZeroCards)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        t.getCollection('objects', 'entity_1').then((collection) => {
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
      }).catch(({response}) => {
        console.log('ERROR: ' + response.status + ' ' + response.text)
      })
  })

  it('POST to /records/  a "record" without any "id" results =>  error 500', (done) => {
    let r = JSON.parse(JSON.stringify(oneUserOneCard))
    delete r.id
    t.sendPOST('/api/coms/records', r)
      .then((res) => {
        t.expect(res.status).to.equal(500)
        console.log(res.text)
        done()
      })
      .catch(({response}) => {
        t.expect(response.status).to.equal(500)
        console.log(response.text)
        done()
      })
  })

  it('POST to /records/  a "record" without any "code" results =>  only a record and no card', (done) => {
    let r = JSON.parse(JSON.stringify(oneUserOneCard))
    delete r.code
    t.sendPOST('/api/coms/records', r)
      .then((res) => {
        t.expect(res.status).to.equal(500)
        console.log(res.text)
        done()
      })
      .catch(({response}) => {
        t.expect(response.status).to.equal(500)
        console.log(response.text)
        done()
      })
  })

  it('POST to /records/ and GET via /records/ returns the user and card', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/records').then((res) => {
          t.expect(res.status).to.equal(200)
          console.log(res.body)
          let rec0 = res.body[0]
          t.expectProps(rec0, {
            id: oneUserOneCard.id,
            code: oneUserOneCard.code,
            name: oneUserOneCard.name,
            language: oneUserOneCard.language
          })
          // chcking tt_group => array [{'code': 'TT_1U_1C'}],
          t.expectProps(rec0.timetype_grp[0], oneUserOneCard.timetype_grp[0])
          // checking validity
          t.expectProps(rec0.validity[0], oneUserOneCard.validity[0])
          done()
        })
      }).catch(({response}) => {
        console.log('ERROR: ' + response.status + ' ' + response.text)
      })
  })

  it('POST to /records/ and GET via /records/:ID returns the user and card', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/records/' + oneUserOneCard.id).then((res) => {
          t.expect(res.status).to.equal(200)
          console.log(res.body)
          let objRet = res.body
          t.expectProps(objRet, {
            id: oneUserOneCard.id,
            code: oneUserOneCard.code,
            name: oneUserOneCard.name,
            language: oneUserOneCard.language
          })
          // chcking tt_group => array [{'code': 'TT_1U_1C'}],
          t.expectProps(objRet.timetype_grp[0], oneUserOneCard.timetype_grp[0])
          // checking validity
          t.expectProps(objRet.validity[0], oneUserOneCard.validity[0])
          done()
        })
      }).catch(({response}) => {
        console.log('ERROR: ' + response.status + ' ' + response.text)
      })
  })

  it('POST to /records/ and then DELETE via /records/:ID, and then GET ia /records/ returns no records', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => {
        t.expect(res.status).to.equal(200)
      })
      .then(() => t.sendDELETE('/api/coms/records/' + oneUserOneCard.id).then((res) => {
        t.expect(res.status).to.equal(200)
        console.log(res.body)
      }))
      .then(() => {
        t.sendGET('/api/coms/records').then((res) => {
          t.expect(res.status).to.equal(200)
          t.expect(res.body.length).to.equal(0)
          done()
        })
      })
      .catch(({response}) => {
        console.log('ERROR: ' + response.status + ' ' + response.text)
      })
  })

  it('POST oneUserOneCard to /records/, then oneUser2OneCard ' +
    'and GET via /records/ returns only oneUser2OneCard data', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => t.sendPOST('/api/coms/records', oneUser2OneCard))
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // GET via api/records
        t.sendGET('/api/coms/records').then((res) => {
          t.expect(res.status).to.equal(200)
          console.log(res.body)
          let rec0 = res.body[0]
          console.log('rec0 = ' + JSON.stringify(rec0))
          t.expectProps(rec0, {
            id: oneUser2OneCard.id,
            code: oneUser2OneCard.code,
            name: oneUser2OneCard.name,
            language: oneUser2OneCard.language
          })
          // chcking tt_group => array [{'code': 'TT_1U_1C'}],
          t.expectProps(rec0.timetype_grp[0], oneUser2OneCard.timetype_grp[0])
          // checking validity
          t.expectProps(rec0.validity[0], oneUser2OneCard.validity[0])
          done()
        })
      }).catch(({response}) => {
        console.log('ERROR: ' + response.status + ' ' + response.text)
      })
  })

  // GET /api/coms/records or GET /api/coms/records/:id
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

/* global process, require, describe, beforeEach, it, afterEach */

const TestMgr = require('../../TestMgr.js')
let t // Reference to data obtained from TestMgr().get

const oneUserOneCard = {
  'id': '1U_1C',
  'name': '1U_1C Alba Maria Estany',
  'code': '0455',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20180622}],
  'timetype_grp': [{'code': 'TT_1U_1C'}],
  'card': [{'code': 'CARD_CODE_1U_1C', 'start': 20170105, 'end': 20180622}]
}

describe('clockings.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      TestMgr.startTerminalEmulator()
      t = _testdata
      done()
    })
  })

  it('After posting a record {User,Card}, a simulated clocking of "Card" via terminal emulator creates an input that is checked via /api/coms/clockings', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => {
        // Needed to synchronize info terminal & database
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve(res)
          }, 2500)
        })
      })
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // An user and a card is the only content in table 'entity_1'
        t.getCollection('objects', 'entity_1').then((collection) => {
          t.expect(collection.length).to.equal(2)

          // Via API, there are no clockings (an empty array is returned)
          t.sendGET('/api/coms/clockings?fromid=0').then((res) => {
            t.expect(res.status).to.equal(200)
            t.expect(res.body.length).to.equal(0)

            // Send a clocking via TerminalEmulator, that is live and listening via its API
            t.terminalEmulatorSendGET('/clocking/CARD_CODE_1U_1C').then((res) => {
              t.expect(res.status).to.equal(200)

              // Via API, noew there is one clocking, corresponding to card 'CARD_CODE_1U_1C'
              t.sendGET('/api/coms/clockings?fromid=0').then((res) => {
                t.expect(res.status).to.equal(200)
                let arClockings = res.body
                t.expect(arClockings.length).to.equal(1)
                let clkObj = arClockings[0]
                t.expectProps(clkObj, {
                  card: 'CARD_CODE_1U_1C',
                  result: t.CORRECT_CLOCKING
                })
                done()
              })
            })
          })
        })
      }).catch((e) => {
        if (e.response) console.log('ERROR: ' + e.response.status + ' ' + e.response.text)
        else console.log.error(e)
      })
  })

  it('After posting a record {User,Card}, a simulated cloking OF A __MISSING_CARD_CODE__ via terminal emulator creates an input but result is "E02" instead of "E00"', (done) => {
    t.sendPOST('/api/coms/records', oneUserOneCard)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        // An user and a card is the only content in table 'entity_1'
        t.getCollection('objects', 'entity_1').then((collection) => {
          t.expect(collection.length).to.equal(2)

          // Via API, there are no clockings (an empty array is returned)
          t.sendGET('/api/coms/clockings?fromid=0').then((res) => {
            t.expect(res.status).to.equal(200)
            t.expect(res.body.length).to.equal(0)

            // Send a clocking via TerminalEmulator, that is live and listening via its API
            t.terminalEmulatorSendGET('/clocking/__MISSING_CARD_CODE__').then((res) => {
              t.expect(res.status).to.equal(200)

              // Via API, noew there is one clocking, corresponding to card 'CARD_CODE_1U_1C'
              t.sendGET('/api/coms/clockings?fromid=0').then((res) => {
                t.expect(res.status).to.equal(200)
                let arClockings = res.body
                t.expect(arClockings.length).to.equal(1)
                let clkObj = arClockings[0]
                t.expectProps(clkObj, {
                  card: '__MISSING_CARD_CODE__',
                  result: t.INCORRECT_CLOCKING // "E02"
                })
                done()
              })
            })
          })
        })
      }).catch((e) => {
        if (e.response) console.log('ERROR: ' + e.response.status + ' ' + e.response.text)
        else console.log.error(e)
      })
  })

  // -------------------------------------------------------------------------------------------
  // afterEach(): OPTION 1) Destroys and recreates BD from it() to other it()'s
  // -------------------------------------------------------------------------------------------
  afterEach((done) => {
    t.rollbackAndMigrateDatabases().then(() => done())
  })
})

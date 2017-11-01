/* global process, require, describe, beforeEach, it, afterEach */

const TestMgr = require('../../TestMgr.js')
let t // Reference to data obtained from TestMgr().get

const oneUserOneCardExport = {
  'id': '1U_1C',
  'name': '1U_1C_User_Name',
  'code': '12345',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20180622}],
  'timetype_grp': [{'code': 'TT_1EXO'}],
  'card': [{'code': 'CARD_EXPORT_12345', 'start': 20170105, 'end': 20180622}]
}

/*
  This test is an amplification of 'clockings.spec.js'
  From clockings.spec.js: =>
    ==> 'After posting a record {User,Card}, a simulated cloking of "Card" via terminal emulator creates an input
    ==> that is checked via /api/coms/clockings'
    Because Lemuria exporter is configured, after the clock is inserted, the corresponding export file is created (or updated)
    therefore this file must be checked if it contains the clocking
* */
describe('export.spec.js', () => {
  beforeEach((done) => {
    // Ensures Lemuria is created and all needed references are stored in "t"
    TestMgr.get().then((_testdata) => {
      TestMgr.startTerminalEmulator()
      t = _testdata
      done()
    })
  })

  it('Clears exportClockings file, adds oneUserOneCard, inserts a card clocking via termEmulator => a new export file containing clocking fields is checked', (done) => {
    let cardId = 'CARD_EXPORT_12345'

    // Sync removes export file
    t.removeExportClockingsFile()

    t.sendPOST('/api/coms/records', oneUserOneCardExport)
      .then((res) => {
        // Needed to synchronize info terminal & database
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve(res)
          }, 1500)
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
            t.terminalEmulatorSendGET(`/clocking/${cardId}`).then((res) => {
              t.expect(res.status).to.equal(200)

              // Via API, noew there is one clocking, corresponding to card 'CARD_CODE_1U_1C'
              t.sendGET('/api/coms/clockings?fromid=0').then((res) => {
                t.expect(res.status).to.equal(200)
                let arClockings = res.body
                t.expect(arClockings.length).to.equal(1)
                let clk = arClockings[0]
                t.expectProps(clk, {
                  card: cardId,
                  result: t.CORRECT_CLOCKING
                })
                // Obrir l'arxiu i verificar que conté el marcatge
                t.verifyExportClockings([clk.id, clk.card, clk.result, t.CORRECT_CLOCKING]).then(() => {
                  done()
                })
              })
            })
          })
        })
      }).catch((e) => {
        if (e.response) console.log('ERROR: ' + e.response.status + ' ' + e.response.text)
        else console.log(e)
      })
  })

  afterEach((done) => {
    t.rollbackAndMigrateDatabases().then(() => done())
  })
})

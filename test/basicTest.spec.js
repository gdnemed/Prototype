/* global process, require, describe, beforeEach, it, afterEach */

const TestMgr = require('./TestMgr.js')
let t // Reference to data obtained from TestMgr().get
let data_1 = {
  'id': 'FROMTEST_1',
  'name': 'FROMTEST_Alba Maria Estany',
  'code': '0455',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'FROMTEST_1'}],
  'card': [{'code': 'FROMTEST_12826', 'start': 20170105, 'end': 20170622}]
}

let data_2 = {
  'id': 'FT_2',
  'name': 'FT_2 Josep Pérez',
  'code': '0323',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'FT_2'}],
  'card': [{'code': 'FT_2826', 'start': 20170105, 'end': 20170622}]
}

describe('API Routes', () => {
  beforeEach((done) => {
    TestMgr.get().then((_testdata) => {
      t = _testdata
      done()
    })
  })

  it('Basic-test-1', (done) => {
    console.log('Basic-test-1')
    t.chai.request(t.lemuriaAPI).post('/api/coms/records').send(data_1)
      .then((res) => {
        // TODO: res.body can be checked, also res.statusCde, etc
        t.expect(res.status).to.equal(200)
        let kObjects = t.knexRefs['objects']
        kObjects.select().table('entity_1')
          .then((collection) => {
            t.expect(collection.length).to.equal(2)
            done()
          })
      })
      .catch((err) => {
        console.log(err)
      })
  })

  it('Basic-test-2', (done) => {
    console.log('Basic-test-2')
    t.chai.request(t.lemuriaAPI).post('/api/coms/records').send(data_2)
      .then((res) => {
        t.expect(res.status).to.equal(200)
        let kObjects = t.knexRefs['objects']
        kObjects.select().table('entity_1')
          .then((collection) => {
            t.expect(collection.length).to.equal(2)
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
    let kObjects = t.knexRefs['objects']
    kObjects.migrate.rollback().then(() => {
      kObjects.migrate.latest().then(() => done())
    })
  })
  // -------------------------------------------------------------------------------------------
  // afterEach(): OPTION 2) (NOT Prefereable) Does nothing, tables are not restored from it() to other it()'s
  // -------------------------------------------------------------------------------------------
  /*
   afterEach((done) => {
   done()
   })
   */





/* //TODO: veure com podem posar dins de migrations la creació i rollback....
  beforeEach((done) => {
    knex.migrate.rollback()
            .then(() => knex.migrate.latest())
            /!* .then(() => knex.seed.run()) *!/
            .then(() => done())
  })
*/

  /* afterEach((done) => {
    knex.migrate.rollback().then(() => done())
  }) */

  /* describe('GET /simple_persons', () => {
    it('should return all persons', (done) => {
      chai.request(server)
                .get('/simple_persons')
                .end(function (err, res) {
                  res.should.have.status(200)
                  res.body.should.be.a('array')
                  res.body.length.should.equal(1)
                  res.body[0].should.have.property('firstName')
                  res.body[0].firstName.should.equal('TEST_firstName')
                  res.body[0].should.have.property('lastName')
                  res.body[0].lastName.should.equal('TEST_lastName')
                  res.body[0].should.have.property('age')
                  res.body[0].age.should.equal(222)
                  done()
                })
    })
  }) */
})

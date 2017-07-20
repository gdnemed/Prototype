/* global process, require, describe, beforeEach, it, afterEach */
process.env.NODE_ENV = 'test'

const chai = require('chai')
const chaiHttp = require('chai-http')
chai.use(chaiHttp)
const expect = chai.expect
const lemuria = require('../lemuria.js')

let knexRefs, environment
let lemuriaAPI
let data1 = {
  'id': 'FROMTEST_1',
  'name': 'FROMTEST_Alba Maria Estany',
  'code': '0455',
  'language': 'es',
  'validity': [{'start': 20170105, 'end': 20170622}],
  'timetype_grp': [{'code': 'FROMTEST_1'}],
  'card': [{'code': 'FROMTEST_12826', 'start': 20170105, 'end': 20170622}]
}

describe('API Routes', () => {
  //TODO!!!!  To be executed before eachTest!
  beforeEach((done) => {
    lemuria.init()
      .then((knexObj) => {
        // getting refences to knex objects
        knexRefs = knexObj
        console.log('Migrations.init() invoked from test')
         // getting environment to know Ports, Urls, etc
        environment = lemuria.getEnvironment()
        let port = environment.api_listen.port
        expect(parseInt(port, 10)).to.be.greaterThan(1000)
        lemuriaAPI = `localhost:${port}`
        console.log(`lemuriaAPI for testing is: ${lemuriaAPI}`)
        done()
      })
  })

  it('------TEST API --------', (done) => {
    console.log('------TEST API --------')
    chai.request(lemuriaAPI).post('/api/coms/records').send(data1)
      .then((res) => {
        let kObjects = knexRefs['objects']
        kObjects.select().table('entity_1')
          .then((collection) => {
            expect(collection.length).to.equal(2)
            done()
          })
      })
      .catch((err) => {
        console.log(err)
      })
  })

  afterEach((done) => {
    let kObjects = knexRefs['objects']
    // kObjects.migrate.rollback().then(() => done())
    done()
  })

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

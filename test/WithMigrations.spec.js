/* global process, require, describe, beforeEach, it, afterEach */
process.env.NODE_ENV = 'test'

let chai = require('chai')
let should = chai.should()
let chaiHttp = require('chai-http')
/* let server = require('../app') */

// const Knex = require('knex')
const migrations = require('../migrations')

chai.use(chaiHttp)

let knexRefs

describe('API Routes', () => {
  beforeEach((done) => {
    migrations.init().then(
      (knexObj) => {
        knexRefs = knexObj
        console.log('MIGRAtions init invoked from test')
        done()
      }
    )
  })

  // Required at least one "it" for "beforeEach()" to be executed
  it('should return all persons', (done) => {
    let kState = knexRefs['state']
    kState.select().table('settings')
      .then((collection) => {
        collection.length.should.equal(0)
      })

    kState.select().table('global_id')
      .then((collection) => {
        collection.length.should.equal(1)
        collection[0].id.should.equal(1)
      })

    done()
  })

  afterEach((done) => {
    let kState = knexRefs['state']
    kState.migrate.rollback().then(() => done())
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

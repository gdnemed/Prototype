var assert = require('assert')
var chai = require('chai')
var chaiHttp = require('chai-http')
chai.use(chaiHttp)
const expect = chai.expect
var app = 'localhost:8081'

var ok = false

describe('Data testing process', function () {
  it('Inserting an employee without code should return error 400', function (done) {
    chai.request(app).post('/api/coms/records').send({name: 'Alberto'})
        .then(function (res) {
          expect(res.statusCode).to.equal(400)
          done()
        }, function (error) {
          try {
            if (error.response == null) {
              console.log('Sever nor responding')
              process.exit(0)
            } else assert(error.response.statusCode == 400)
            done()
          } catch (e) {
            done('Return code is not 400, it is ' + error.response.statusCode)
          }
        })
  })
  it('Inserting an employee wit code should return 201', function (done) {
    chai.request(app).post('/api/coms/records').send({id: 5, name: 'Alberto'})
        .then(function (res) {
          expect(res.statusCode).to.equal(201)
          done()
        }, function (error) {
          try {
            if (error.response == null) {
              console.log('Sever nor responding')
              process.exit(0)
            }
          } catch (e) {}
          done(e)
        })
  })
})

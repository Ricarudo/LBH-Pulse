const  MockItem = require('../../mock/mock.item');
let chai = require('chai');
require('dotenv').config()
let chaiHttp = require('chai-http');
let server = require('../../../app');
let should = chai.should();
let expect = chai.expect();
chai.use(chaiHttp);

const BACKEND_HOSTNAME = 'localhost';
const BACKEND_PORT = process.env.PORT;

describe("Items Endpoint CRUD OPS", () => {
   const items =  require('../../mock/data/items.json');
   const expected = MockItem.createItem();

    it("Should CREATE Item in DB", (done) => {
        
            chai.request(server)
                .post("/items/")
                .send(expected)
                .end( (err, res) => {
                    res.should.have.status(200);
                    res.body.should.have.property('result');
                    res.body.should.have.property('item_id');
                    console.log('Received ID query:', res.body);
                    expected.setID(res.body.item_id);
                    console.log(`Received ID: ${res.body.item_id}`)
                    if(err) {
                        done(err);
                    }
                    
                })
        done();        
    });

    it("Should FAIL to CREATE Item with Empty Params in DB", (done) => {
        expected.setManufacturer('');
        expected.setName('');
        chai.request(server)
            .post("/items/")
            .send(expected)
            .end( (err, res) => {
                res.should.have.status(400);
                if(err) {
                    done(err);
                }
                
            })
        done();
    });

    it("Should READ Item by ID in DB", (done) => {
           chai.request(server)
               .get(`/items/${expected.getID()}`)
               .end( (err, res) => {
                   res.should.have.status(200);
                //    res.body.should.be.a('array');
                //    res.body.length.should.be.eql(1);

                   if(err) {
                    done(err);
                    }
               });

        done();
    });

    it("Should FAIL to READ Item by fake ID in DB", (done) => {

        chai.request(server)
            .get(`/items/`+'42069')
            .end( (err, res) => {
                res.should.have.status(400);

                if(err) {
                 done(err);
                 }
            });

        done();
    });

    it("Should DELETE Particular Item", (done)=>{
        chai.request(server)
            .delete("/items/"+expected.getID())
            .end((err, result)=>{   
                
                console.log(`[Delete Item] ${JSON.stringify(result.body)}`);
                // result.should.have.status(200);

                if(err) {
                    done(err);
                }

            })
        done();
    });

    it("Should FAIL to DELETE Particular Item by fake ID", (done)=>{
        chai.request(server)
            .delete("/items/"+"67890000")
            .end((err, result)=>{                    
                result.should.have.status(400);

                if(err) {
                    done(err);
                }

            })
        done();
    });

});


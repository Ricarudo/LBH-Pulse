
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../../../app');
const Quote = require('../../../models/quote');
const MockQuote = require('../../mock/mock.quote');
let should = chai.should();
chai.use(chaiHttp);


describe("Quotes Enpoint CRUD OPS", () => {
   const quotes =  require('../../mock/data/quotes.json');
   const quote = MockQuote.createQuote();
    it("Should CREATE Quotes in DB", (done) => {
            
            chai.request(server)
                .post("/quotes/")
                .send(quote)
                .end( (err, res) => {

                    res.should.have.status(200);
                    quote.setID(res.body.quote_id);
                    if(err) {
                        done(err);
                    } else {
                        done();
                    }
                })
    })

    it("Should FAIL to CREATE Quotes with EMPTY Params in DB", (done) => {
        quote.setLID('');
        quote.setClient('');
        quote.setBOM('');

        chai.request(server)
            .post("/quotes/")
            .send(quote)
            .end( (err, res) => {
                res.should.have.status(400);

                if(err) {
                    done(err);
                } else {
                    done();
                }
            })
})

    it("Should READ Quotes by ID in DB", (done) => {
       
           chai.request(server)
               .get("/quotes/"+quote.getID())
               .end( (err, res) => {
                   res.should.have.status(200);

                   if(err) {
                    done(err);
                    } else {
                        done();
                    } 
               });
        
    });

    it("Should FAIL to READ Quotes of non-existing ID in DB", (done) => {
       
        chai.request(server)
            .get("/quotes/"+"50131435")
            .end( (err, res) => {
                res.should.have.status(400);

                if(err) {
                 done(err);
                 } else {
                     done();
                 } 
            });
     
 });

    it("Should DELETE Particular Quotes", (done) => {
        chai.request(server)
            .delete("/quotes/"+quote.getID())
            .end((err, result)=>{                    
                result.should.have.status(200);                
                console.log("Deleted Particular Quote", result.body);
                result.body.should.have.property('result');
                result.body.should.have.property('quote_id');
                if(err) {
                    done(err);
                }

            });
       done();
    });

    it("Should FAIL to DELETE Inexistent Quote IDs", (done) => {
        chai.request(server)
            .delete("/quotes/fake-id-here")
            .end((err, result)=>{                    
                result.should.have.status(400);                
                // console.log("Deleted Particular Quote", result.body);
                // result.body.should.have.property('result');
                // result.body.should.have.property('quote_id');
                if(err) {
                    done(err);
                } else{
                    done();
                } 

            });
       
    });

});


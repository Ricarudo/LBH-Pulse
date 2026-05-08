
const MockLead = require('../../mock/mock.lead');
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../../../app');
let should = chai.should();
chai.use(chaiHttp);


describe("Leads Endpoint CRUD OPS", () => {
   const leads =  require('../../mock/data/leads.json');
   const expected_lead = MockLead.createLead();

    it("Should CREATE Leads in DB", (done) => {

            chai.request(server)
                .post("/leads/")
                .send(expected_lead)
                .end( (err, res) => {
                    res.body.should.be.a('object');
                    res.should.have.status(200);
                    res.body.should.have.property('result');
                    res.body.should.have.property('lead_id');
                    expected_lead.setID(res.body.lead_id);
                    if(err) {
                        done(err);
                    } else {
                        done();
                    } 
                })
    })

    it("Should FAIL to CREATE Leads in DB with Empty Params", (done) => {

        expected_lead.setClient('');
        expected_lead.setClientSite('');

        chai.request(server)
            .post("/leads/")
            .send(expected_lead)
            .end( (err, res) => {
                
                res.should.have.status(400);

                if(err) {
                    done(err);
                } else {
                    done();
                } 
            })
})

    it("Should READ Leads by ID in DB", (done) => {
       
           chai.request(server)
               .get(`/leads/${expected_lead.getID()}`)
               .end( (err, res) => {

                   res.should.have.status(200);                
                   res.body.should.be.a('array');
                   res.body.length.should.be.eql(1);

                   if(err) {
                    done(err);
                    } else{
                        done();
                    } 
               });
        
    });

    it("Should FAIL to READ Leads by non-existing ID in DB", (done) => {
       
        chai.request(server)
            .get(`/leads/`+'fake-id-here')
            .end( (err, res) => {

                res.should.have.status(400);
                
                if(err) {
                 done(err);
                 } else{
                     done();
                 } 
            });
     
 });

    it("Should DELETE Particular Lead", (done)=>{
        chai.request(server)
            .delete(`/leads/${expected_lead.getID()}`)
            .end((err, result)=>{                    
                result.should.have.status(200);                

                if(err) {
                    done(err);
                } else {
                    done();
                } 

            });
    });

    it("Should FAIL to DELETE Lead with non-existing ID", (done)=>{
        chai.request(server)
            .delete(`/leads/`+'fake-id-here')
            .end((err, result)=>{                    
                result.should.have.status(400);                

                if(err) {
                    done(err);
                } else {
                    done();
                } 

            });
    });

});


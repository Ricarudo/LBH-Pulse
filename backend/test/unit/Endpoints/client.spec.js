// var assert = require('assert');
// let chai = require('chai');
// let chaiHttp = require('chai-http');
// let server = require('../../../app');
// let MockClient = require('../../mock/mock.client');
// let should = chai.should();
// chai.use(chaiHttp);


// describe("clients Endpoint CRUD OPS", () => {
//    const client = MockClient.createClient();
   
//     it("Should CREATE clients in DB", (done) => {
        
//         chai.request(server)
//             .post("/clients/")
//             .send(client)
//             .end( (err, res) => {
//                 res.should.have.status(200);
                
//                 res.body.should.have.property('result');
//                 res.body.should.have.property('client_id');

//                 client.setClient_ID(res.body.client_id);
//                 if(err) {
//                     done(err);
//                 } 
//             });
        
//         done();
//     });

//     it("Should FAIL to CREATE clients with Empty Params in DB", (done) => {
//         client.setCompanyName('');

//         chai.request(server)
//             .post("/clients/")
//             .send(client)
//             .end( (err, res) => {
//                 res.should.have.status(400);
//                 if(err) {
//                     done(err);
//                 } 
//             });
        
//             done();

//     });

//     it("Should READ clients by ID in DB", (done) => {
//            chai.request(server)
//                .get(`/clients/${client.getClient_ID()}`)
//                .end( (err , res) => {

//                     res.should.have.status(200);

//                     if(err) {
//                         done(err);
//                     } 
//                });

//                done();
//     });

// //     it("Should FAIL to READ clients by fake ID in DB", (done) => {
// //         chai.request(server)
// //             .get(`/clients/`+'696969')
// //             .end( (err , res) => {

// //                  res.should.have.status(400);

// //                  if(err) {
// //                      done(err);
// //                  }
// //             });

// //             done();
// //  });

// //    it("Should UPDATE specific Client Only", (done) => {
       
// //         // const updatedclient = MockClient.createClient("");
// //         // updatedclient.setClient_ID(client.getClient_ID());
// //         client.setComments("Plaka Plaka");
// //         client.setCompanyName("Mayamon");
// //         chai.request(server)
// //             .put(`/clients/${client.getClient_ID()}`)
// //             .send(client)
// //             .end( (err, res) => {
// //                 res.should.have.status(200);
// //             })
        
// //         done();
// //     });

//     // it("Should FAIL to UPDATE specific Client with Empty Params", (done) => {
       
//     //     client.setCompanyName("");
//     //     chai.request(server)
//     //         .put(`/clients/${client.getClient_ID()}`)
//     //         .send(client)
//     //         .end( (err, res) => {
//     //             res.should.have.status(400);
//     //         })
        
//     //     done()
//     // });

//     it("Should DELETE Particular client", (done)=>{
//         chai.request(server)
//             .delete("/clients/"+client.client_id)
//             .end((err, result)=>{                    
//                 result.should.have.status(200);
//                 result.body.should.have.property('result');
//                 result.body.should.have.property('client_id'); 
//             });
//             done();
//     });

//     it("Should FAIL to DELETE Client with fake ID", (done)=>{
//         chai.request(server)
//             .delete("/clients/"+'420420420')
//             .end((err, result)=>{                    
//                 result.should.have.status(400);
//             });
//             done();
//     });

// })


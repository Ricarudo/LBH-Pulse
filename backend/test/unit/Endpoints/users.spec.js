var assert = require('assert');
let MockUser = require('../../mock/mock.user');
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../../../app');
const { use } = require('chai');
let should = chai.should();
chai.use(chaiHttp);




describe("Users Endpoint CRUD OPS", () => {

    const user = MockUser.createEstimator();

    it("Should CREATE Users in DB", (done) => {
        
        chai.request(server)
            .post("/users/")
            .send(user)
            .end( (err, res) => {
                res.should.have.status(200);
                // console.log("Response Body:", res.body);

                if(err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("Should FAIL to CREATE Users in DB with Empty Params", (done) => {
        user.setEmail('');
        user.setName('');

        chai.request(server)
            .post("/users/")
            .send(user)
            .end( (err, res) => {
                res.should.have.status(400);

                if(err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("Should READ Users by ID in DB", (done) => {
           chai.request(server)
               .get("/users/"+user.getID())
               .end( (err , res) => {

                    res.should.have.status(200);

                    if(err) {
                        done(err);
                    } else {
                        done();
                    } 
               });
    });

    it("Should FAIL to READ Users by non-existing ID in DB", (done) => {
        chai.request(server)
            .get("/users/"+"fake-id-here")
            .end( (err , res) => {

                 res.should.have.status(400);

                 if(err) {
                     done(err);
                 } else {
                     done();
                 } 
            });
 });

//    // it("Should UPDATE specific User Only", (done) => {
       
//         const updatedUser = {
//             "id" : 0,
//             "email" : "joe.mama@mail.com",
//             "name" : "Joe Mama",
//             "role" : "Estimator",
//             "phone" : "787-123-4567"
//         }

//         chai.request(server)
//             .get("/users/"+user.id)
//             .end( (err, res) => {
//                 .should.have.status(200);
//                 console.log("Response Body:", res.body);
//             })
        
//         done()
//      })

    it("Should DELETE Particular User", (done)=>{
        chai.request(server)
            .delete("/users/"+user.getID())
            .end((err, result)=>{                    
                result.should.have.status(200)                
                console.log("Deleted Particular User:", result.body);

                
                if(err) {
                    done(err);
                } else {
                    done();
                } 
            });

    });

    // it("Should FAIL to DELETE User with non-existing ID", (done)=>{
    //     user.setID(undefined);
    //     chai.request(server)
            
    //         .delete("/users/"+user.getID())
    //         .end((err, result)=>{                    
    //             result.should.have.status(400);
    //             console.log("Result of fake ID delete:",result);

    //             if(err) {
    //                 done(err);
    //             } else {
    //                 done();
    //             } 
    //         });

    // });

})


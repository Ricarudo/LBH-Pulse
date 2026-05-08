const faker = require('faker');
const User = require('../../models/user');

class MockUser{

    constructor(){}

    static createUser(role){
        return new User({
            "id" : faker.datatype.number(),
            "email" : faker.internet.exampleEmail(),
            "name" : faker.name.findName(),
            "role" : role,
            "phone" : faker.phone.phoneNumber()
        });
    }

    static createEstimator(){
        return MockUser.createUser("Estimator");
    }

    static createManager(){
        return MockUser.createUser("Manager");
    }

    static createAdministrator(){
        return MockUser.createUser("Administrator");
    }

}


module.exports = MockUser;
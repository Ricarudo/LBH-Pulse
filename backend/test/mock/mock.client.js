const faker = require('faker');
const Client = require('../../models/client');

class MockClient{

    constructor(){}

    static createClient(){
        return new Client({
            "client_id" : '',
            "companyName" : faker.name.findName(),
            "comments" : faker.random.word()
        });
    }

}


module.exports = MockClient;
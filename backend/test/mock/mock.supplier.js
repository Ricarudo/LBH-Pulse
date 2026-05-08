const faker = require('faker');
const Supplier = require('../../models/supplier');

class MockSupplier{

    constructor(){}

    static createSupplier(){
        return new Supplier({
            "supplier_id" : faker.datatype.number(),
            "point_of_contact_id" : faker.datatype.number(),
            "name" : faker.name.findName(),
            "phone" : faker.phone.phoneNumber(),
            "email" : faker.random.email(),
        });
    }

}


module.exports = MockSupplier;
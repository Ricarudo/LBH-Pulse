const Item = require("../../models/item");
const faker = require("faker");


class MockItem{
    constructor(){
    }

    static createItemWithID(id){
        return new Item({
            "id" : id,
            "name" : faker.name.findName(),
            "partNumber": faker.datatype.number(),
            "manufacturer": faker.datatype.number(),
            "description": faker.random.word()
        });
    }

    static createItem(){
        return new Item({
            "id" : '',
            "name" : faker.name.findName(),
            "partNumber": faker.name.findName(),
            "manufacturer": faker.name.findName(),
            "description": faker.random.words()
    
        });
    }
}

module.exports = MockItem;
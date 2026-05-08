
const faker = require('faker');
const Lead = require('../../models/lead');

class MockLead {

    constructor(){
    }

    static createLead(){
        const today = new Date();
        const date = today.getDate();
        const month = today.getMonth();
        const year = today.getUTCFullYear();
        const hour = today.getHours();
        const mins = today.getMinutes();
        return new Lead({   id : faker.datatype.number(),
                            title : faker.name.findName(),
                            projectDescription : faker.random.words(2),
                            client : faker.datatype.number(),
                            clientSite : faker.datatype.number(),
                            assignedEmployee : faker.datatype.number(),
                            pointOfContact : faker.datatype.number(),
                            dateCreated : `${year}/${month}/${date}`,
                            dateReceived: `${year}/${month}/${date}`,//faker.date.past(1), `${year}-${month}-${date} ${hour}:${mins}:${mins}`
                            dateDue: `${year}/${month}/${date}`,//faker.date.future(1),
                            state : faker.datatype.number(8),
                            comments: faker.random.words(1),
                        })
    }

}

module.exports = MockLead;
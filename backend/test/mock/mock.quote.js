
const faker = require('faker');
const Quote = require('../../models/quote');

class MockQuote {

    constructor(){
    }

    static createQuote(){
        const today = new Date();
        const date = today.getDate();
        const month = today.getMonth();
        const year = today.getUTCFullYear();
        const hour = today.getHours();
        const mins = today.getMinutes();
        return new Quote({   
                            id : faker.datatype.number(),
                            r2_id : faker.random.word(),
                            lead_id : faker.datatype.number(),
                            title :faker.name.findName(),
                            projectDescription : faker.random.words(),
                            dateCreated: `${year}-${month}-${date} ${hour}:${mins}:${mins}`,
                            dueDate: `${year}-${month}-${date} ${hour}:${mins}:${mins}`,
                            dateReceived: `${year}-${month}-${date} ${hour}:${mins}:${mins}`,
                            assignedEmployees :faker.random.arrayElements(),
                            current_employee_id : faker.datatype.number(),
                            comments: faker.random.words(),
                            bill_of_materials_id : faker.datatype.number(),
                            laborCosts : faker.datatype.number(),
                            materialCosts : faker.datatype.number(),
                            eventRegister : faker.random.word(),
                            proposalSpecifications : faker.random.words(),
                            state_id : faker.datatype.number(8),
                            client_id : faker.datatype.number(),
                            client_site_id :  faker.datatype.number(),
                            attachments_id : faker.datatype.number(),
                            point_of_contact_id : faker.datatype.number(),
                        })
    }

}

module.exports = MockQuote;
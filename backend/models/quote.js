/** Model for describing a Quote in the DB */
class Quote{

    constructor(json){
                    this.setID(json.id);
                    this.setR2ID(json.r2_id);
                    this.setLID(json.lead_id);
                    this.setTitle(json.title);
                    this.setProjectDescription(json.projectDescription);
                    this.setClient(json.client_id);
                    this.setClientSite(json.client_site_id);
                    this.setPointOfContact(json.point_of_contact_id);
                    this.setAttachments(json.attachments_id);
                    this.setDateCreated(json.dateCreated);
                    this.setDateReceived(json.dateReceived);
                    this.setDateDue(json.dueDate);
                    this.setAssignedEmployees(json.assignedEmployees);
                    this.setCurrentEmployee(json.current_employee_id);
                    this.setState(json.state_id);
                    this.setComments(json.comments);
                    this.setBOM(json.bill_of_materials_id);
                    this.setLaborCosts(json.laborCosts);
                    this.setMaterialCosts(json.materialCosts);
                    this.setEventRegister(json.eventRegister);
                    this.setProposalSpecifications(json.proposalSpecifications);
    }
    
    create(json){
        return new Quote(json);
    }


    getID(){ return this.id;}
    
    getR2ID(){ return this.r2_id;}

    getLID(){ return this.lead_id;}

    getTitle(){ return this.title;}
    
    getProjectDescription(){return this.projectDescription;}

    getClient(){ return this.client_id;}

    getClientSite(){ return this.client_site_id;}

    getAttachments(){return this.attachments_id;}

    getPointOfContact(){ return this.point_of_contact_id;}

    getDateCreated(){ return this.dateCreated;}

    getDateReceived(){  return this.dateReceived;}

    getDateDue(){ return this.dueDate;}

    getAssignedEmployees(){ return this.assignedEmployees;}

    getCurrentEmployee(){ return this.current_employee_id;}

    getState(){    return this.state_id;}

    getComments(){ return this.comments;}

    getBOM(){ return this.bill_of_materials_id;}

    getMaterialCosts(){return this.materialCosts;}

    getEventRegister(){ return this.eventRegister;}

    getProposalSpecifications(){ return this.proposalSpecifications;}

    getLaborCosts(){ return this.laborCosts;}

    setID(id){
        // if(typeof id == "number")
            this.id = id;
    }

    setR2ID(r2id){
        this.r2_id = r2id;
    }

    setLID(lid){
        this.lead_id = lid;
    }

    setTitle(title){
        // if(title.instanceOf(String))
            this.title = title;
    }
    
    setProjectDescription(proj_desc){
        // if(proj_desc.instanceOf(String))
            this.projectDescription = proj_desc;
    }

    setClient(client){
        // if(client.instanceOf(String))
            this.client_id = client;
    }

    setClientSite(client_site){
        // if(client_site.instanceOf(String))
            this.client_site_id = client_site;
    }

    setPointOfContact(poc){
        // if(poc.instanceOf(poc))
            this.point_of_contact_id = poc;
    }

    setDateCreated(created){
        this.dateCreated = created;
    }

    setDateReceived(received){
        // if(received.instanceOf(String))
            this.dateReceived = received;
    }

    setDateDue(due){
        // if(due.instanceOf(String))
            this.dueDate = due;
    }

    setState(state){
        // if(state.instanceOf(String))
            this.state_id = state;
    }

    setComments(comments){
        // if(comments.instanceOf(String))
            this.comments = comments;
    }

    setAttachments(attachments){
        this.attachments_id = attachments;
    }

    setAssignedEmployees(employees){
        this.assignedEmployees = employees;
    }

    setCurrentEmployee(employee){
        this.current_employee_id = employee;
    }

    setBOM(bom){
        this.bill_of_materials_id = bom;
    }

    setLaborCosts(lbcosts){
        this.laborCosts = lbcosts;
    }

    setMaterialCosts(matCosts){
        this.materialCosts = matCosts;
    }

    setEventRegister(event){
        this.eventRegister = event;
    }

    setProposalSpecifications(proposalSpecs){
        this.proposalSpecifications = proposalSpecs;
    }

    toJSON()
    {
        return {
            "quote_id": this.getID(),
            "r2_id" : this.getR2ID(),
            "lead_id" : this.getLID(),
            "state_id" : this.getState(),
            "client_id" : this.getClient(),
            "client_site_id" : this.getClientSite(),
            "point_of_contact_id" : this.getPointOfContact(),
            "title" : this.getTitle(),
            "dueDate" : this.getDateDue(),
            "dateCreated" : this.getDateCreated(),
            'dateReceived' : this.getDateReceived(),
            "projectDescription" : this.getProjectDescription(),
            "comments" : this.getComments(),
            // "attachments_id" : this.getAttachments(),
            "current_employee_id"  : this.getCurrentEmployee(),
            // "bill_of_materials_id" : this.getBOM(),
            "proposalSpecifications" : this.getProposalSpecifications()
        };
    }

    toSQLColumns(){
        return [ "quote_id" ,
        "r2_id" ,
        "lead_id" ,
        "state_id" ,
        "client_id" ,
        "client_site_id" ,
        "pointOfContact_id" ,
        "title",
        "dueDate" ,
        "dateCreated" ,
        "projectDescription" ,
        "comments" ,
        "attachments_id" ,
        "current_employee_id" ,
        "bill_of_materials_id" ,
        "proposalSpecifications" ];
    }
}


module.exports = Quote;
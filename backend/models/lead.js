/** Model for describing a Lead in the DB */
class Lead{

    constructor(json){
        this.setID(json.id);
        this.setTitle(json.title);
        this.setProjectDescription(json.projectDescription);
        this.setClient(json.client);
        this.setClientSite(json.clientSite);
        this.setPointOfContact(json.pointOfContact);
        this.setAssignedEmployee(json.assignedEmployee);
        this.setDateReceived(json.dateReceived);
        this.setDateDue(json.dateDue);
        this.setDateCreated(json.dateCreated);
        this.setState(json.state);
        this.setComments(json.comments);
    }
    // constructor(id, title, projectDescription,
    //             client, clientSite, pointOfContact, 
    //             dateReceived, dateDue, state, comments){
    //     this.setID(id);
    //     this.setTitle(title);
    //     this.setProjectDescription(projectDescription);
    //     this.setClient(client);
    //     this.setClientSite(clientSite);
    //     this.setPointOfContact(pointOfContact);
    //     this.setDateReceived(dateReceived);
    //     this.setDateDue(dateDue);
    //     this.setState(state);
    //     this.setComments(comments);

    // }

    getID(){
        return this.lead_id;
    }

    getTitle(){
        return this.title;
    }
    
    getProjectDescription(){
        return this.project_description;
    }

    getClient(){
        return this.client_id;
    }

    getClientSite(){
        return this.client_site_id;
    }

    getAssignedEmployee(){
        return this.assigned_employee_id;
    }

    getPointOfContact(){
        return this.point_of_contact_id;
    }

    getDateReceived(){
        return this.dateReceived;
    }

    getDateCreated(){
        return this.dateCreated;
    }

    getDateDue(){
        return this.dueDate;
    }

    getState(){
        return this.state_id;
    }

    getComments(){
        return this.comments;
    }

    setID(id){
        // if(typeof id == "number")
            this.lead_id = id;
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

    setAssignedEmployee(assignedEmployee){
        this.assigned_employee_id = assignedEmployee;
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

    toJSON()
    {
        return {
            // "lead_id": this.getID(),
            "title" : this.getTitle(),
            "projectDescription" : this.getProjectDescription(),
            "client_id" : this.getClient(),
            "client_site_id" : this.getClientSite(),
            "point_of_contact_id" : this.getPointOfContact(), 
            "assigned_employee_id" : this.getAssignedEmployee(),
            "dateReceived" : this.getDateReceived(),
            "dueDate" : this.getDateDue(),
            "dateCreated": this.getDateReceived(),
            "state_id" : this.getState(),
            "comments" : this.getComments(),
        };
    }

    toSQLColumns(){
        return ["lead_id",
        "state_id",
        "client_id",
        "clientSite_id",
        "pointOfContact_id",
        "assigned_employee_id",
        "title",
        "dueDate",
        "dateReceived",
        "dateCreated",
        "projectDescription",
        "comments"]
    }
}


module.exports = Lead;
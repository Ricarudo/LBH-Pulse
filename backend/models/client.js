/** Model for describing a Client in the DB */
class Client{
    
    constructor(json){
        this.setClient_ID(json.client_id);
        this.setCompanyName(json.companyName);
        this.setComments(json.comments);
    }

    getClient_ID(){return this.client_id;}
    getCompanyName(){return this.companyName;}
    getComments(){ return this.comments;}
   

    setClient_ID(id){
        // if(typeof id == "number")
            this.client_id = id;
    }

    setCompanyName(name){
        //if(name.instanceof(String))
            this.companyName = name;
    }

    setComments(comment){
        //if(part_number.instanceof(String))
            this.comments = comment;
    }

    toJSON(){
        // if(!this.instanceof(User))
        // return {};

        return {
            'client_id' : this.getClient_ID(),
            'companyName' : this.getCompanyName(),
            'comments' : this.getComments()
            
        };
    }

    toSQLColumns(){
        return [ 'client_id', 'companyName', 'comments'];
    }
}

module.exports = Client;
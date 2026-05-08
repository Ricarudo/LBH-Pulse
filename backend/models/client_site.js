/** Model for describing a Client in the DB */
class ClientSite{
    
    constructor(json){
        this.setClientSite_ID(json.client_site_id);
        this.setClient_ID(json.client_id);
        this.setName(json.name);
        this.setAddress(json.address);
        this.setComments(json.comments);
    }

    getClientSite_ID(){return this.client_site_id;}
    getClient_ID(){return this.client_id;}
    getName(){return this.name;}
    getAddress(){return this.address;}
    getComments(){ return this.comments;}
   
    setClientSite_ID(id){this.client_site_id = id;}
    setClient_ID(id){this.client_id = id;}
    setName(name){this.name = name;}
    setAddress(address){this.address = address;}
    setComments(comment){this.comments = comment;}

    toJSON(){
        return {
            'client': this.getClient(),
            'name' : this.getName(),
            'address': this.getAddress(),
            'comments' : this.getComments()
        };
    }

    toSQLColumns(){
        return [ 'client_site_id', 'client_id', 'name', 'address', 'comments'];
    }
}

module.exports = ClientSite;
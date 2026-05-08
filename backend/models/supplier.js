/** Model for describing a Client in the DB */
class Supplier{
    
    constructor(json){
        this.setSupplier_ID(json.supplier_id);
        this.setName(json.name);
        this.setEmail(json.email);
        this.setPhone(json.phone);
        this.getPointOfContact(json.point_of_contact_id);
    }

    getSupplier_ID(){return this.supplier_id;}
    getName(){return this.name;}
    getEmail(){ return this.email;}
    getPhone(){ return this.phone;}
    getPointOfContact(){ return this.point_of_contact_id;}
   

    setSupplier_ID(id){
        // if(typeof id == "number")
            this.supplier_id = id;
    }

    setName(name){
        //if(name.instanceof(String))
            this.name = name;
    }

    setPhone(phone){ this.phone = phone;}
    setEmail(email){ this.email = email;}
    setPointOfContact(poc){this.point_of_contact_id = poc;}

    toJSON(){
        // if(!this.instanceof(User))
        // return {};

        return {
            // 'client_id' : this.getClient_ID(),
            'name' : this.getName(),
            'comments' : this.getComments(),
            'email' : this.getEmail(),
            'phone' : this.getPhone(),
            'point_of_contact_id' : this.getPointOfContact(),
        };
    }

    toSQLColumns(){
        return [ 'client_id', 'name', 'comments'];
    }
}

module.exports = Client;
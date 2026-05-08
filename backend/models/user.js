/** Model for describing a Lead in the DB */
const Roles = {
    Estimator :"Estimator",
    Administrator : "Administrator",
    Manager : "Manager"
}

class User{

    constructor(json){
        this.setID(json.id);
        this.setEmail(json.email);
        this.setName(json.name);
        this.setRole(json.role);
        this.setPhone(json.phone);
    }

    // constructor(id, email, name, role, phone){
    //     this.setID(id);
    //     this.setEmail(email);
    //     this.setName(name);
    //     this.setRole(role);
    //     this.setPhone(phone);
    // }
    
    create(){
        //dump user to db
        return this;
    }

    getID(){ return this.user_id; }
    getEmail(){ return this.email;}
    getName(){ return this.name;}
    getRole(){ return this.role;}
    getPhone() { return this.phone;}

    setID(id){
        // if(typeof id == "number")
            this.user_id = id;
    }

    setName(name){
        // if(name.instanceof(String))
            this.name = name;
    }

    setRole(role){
        // if(role.instanceof(String))
            this.role = role;
    }

    setEmail(email) {
        // if(email.instanceof(String))
            this.email = email;
    }

    setPhone(phone){
        // if(phone.instanceof(String))
            this.phone = phone;
    }

    toJSON()
    {
        return {
            // 'user_id': this.getID(),
            'email': this.getEmail(),
            'name': this.getName(),
            'role': this.getRole(),
            'phone' : this.getPhone()
        };
    }
}

module.exports = User;

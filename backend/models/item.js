/** Model for describing an Item in the DB */
class Item{
    
    constructor(json){
        this.setID(json.id);
        this.setName(json.name);
        this.setPartNumber(json.partNumber);
        this.setManufacturer(json.manufacturer);
        this.setDescription(json.description);
    }

    getID(){return this.item_id;}
    getName(){return this.name;}
    getPartNumber(){ return this.partNumber;}
    getManufacturer() { return this.manufacturer;}
    getDescription(){ return this.description;}


    setID(id){
        // if(typeof id == "number")
            this.item_id = id;
    }

    setName(name){
        //if(name.instanceof(String))
            this.name = name;
    }

    setPartNumber(part_number){
        //if(part_number.instanceof(String))
            this.partNumber = part_number;
    }

    setManufacturer(manufacturer) {
        //if(manufacturer.instanceof(String))
            this.manufacturer = manufacturer;
    }

    setDescription(description){
        //if(description.instanceof(String))
            this.description = description;
    }

    toJSON(){
        // if(!this.instanceof(User))
        // return {};

        return {
            // 'item_id' : this.getID(), //removed for auto generating in SQL
            'name' : this.getName(),
            'partNumber' : this.getPartNumber(),
            'description' : this.getDescription(),
            'manufacturer': this.getManufacturer()
        };
    }

    toSQLColumns(){
        return [ 'item_id', 'name', 'partNumber', 'description', 'manufacturer'];
    }
}

module.exports = Item;
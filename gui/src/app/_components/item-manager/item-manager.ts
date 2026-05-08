//Angular
import { Component, EventEmitter, Inject, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

//Material
import {MatDialog, MatDialogConfig, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';

//Models
import { Item } from 'src/app/_models/item';

//Services
import { HttpRequestService } from 'src/app/_services/httpRequest.service';



@Component({
  selector: 'app-item-manager',
  templateUrl: './item-manager.html',
  styleUrls: ['./item-manager.css']
})

export class ItemManagerComponent {

  item!: Item;

  createNewItemDialog = false;
  editItemDialog = false;
  viewItemDialog = false;



  newItemForm = new FormGroup({
    item_id: new FormControl(''),
    name: new FormControl(''),
    partNumber: new FormControl(''),
    manufacturer: new FormControl(''),
    description: new FormControl('')
  })

 

 

  @Output() client_id = new EventEmitter();
  
  constructor( private service: HttpRequestService, @Inject(MAT_DIALOG_DATA) public data: {step: string, item_id:number}, public dialog: MatDialog, private dialogRef: MatDialogRef<ItemManagerComponent>) { }

  ngOnInit(): void {

    if(this.data.step=="Create"){
      this.createNewItemDialog = true;
      this.editItemDialog = false;
      this.viewItemDialog = false;
 
    }else if(this.data.step=="Edit"){
      this.createNewItemDialog = false;
      this.editItemDialog = true;
      this.viewItemDialog = false;

      this.service.getItem(this.data.item_id).subscribe((result:any)=>{
        this.newItemForm.patchValue(result[0]);
      });

    }else if(this.data.step=="View"){
      this.createNewItemDialog = false;
      this.editItemDialog = false;
      this.viewItemDialog = true;

      this.newItemForm.disable();

      this.service.getItem(this.data.item_id).subscribe((result:any)=>{
        this.newItemForm.patchValue(result[0]);
      });

    }




  }

  createItem(){
    console.log("Created new Item");
    console.log(JSON.stringify( this.newItemForm.value));
    this.dialogRef.close({ data: this.service.createItem(this.newItemForm.value)});
  }

  editItem(){
    console.log("Created new Item");
    console.log(JSON.stringify( this.newItemForm.value));
    this.dialogRef.close({ data: this.newItemForm.value});
  }



}



      
        
        
      

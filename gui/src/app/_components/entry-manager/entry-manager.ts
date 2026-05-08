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
  selector: 'app-entry-manager',
  templateUrl: './entry-manager.html',
  styleUrls: ['./entry-manager.css']
})

export class EntryManagerComponent {

 

  createNewItemDialog = false;
  editItemDialog = false;



  newItemForm = new FormGroup({
    item_id: new FormControl(''),
    name: new FormControl(''),
    partNumber: new FormControl(''),
    manufacturer: new FormControl(''),
    description: new FormControl('')
  })

 

 

  @Output() client_id = new EventEmitter();
  
  constructor( private service: HttpRequestService, @Inject(MAT_DIALOG_DATA) public data: {step: string}, public dialog: MatDialog, private dialogRef: MatDialogRef<EntryManagerComponent>) { }

  ngOnInit(): void {

 }

  

  editEntry(){
    console.log("Edited entry");
    console.log(JSON.stringify( this.newItemForm.value));
    this.dialogRef.close({ data: this.newItemForm.value});
  }



}
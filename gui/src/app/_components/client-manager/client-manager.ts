//Angular
import { Component, EventEmitter, Inject, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

//Material
import {MatDialog, MatDialogConfig, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';

//Models
import { Client,ClientSite,PointOfContact } from '../../_models/client';

//Services
import { HttpRequestService } from 'src/app/_services/httpRequest.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-client-manager',
  templateUrl: './client-manager.html',
  styleUrls: ['./client-manager.css']
})

export class ClientManagerComponent {

  client!: Client;
  clientSite!: ClientSite;
  pointOfContact!: PointOfContact;

  newClientDialog = false;
  editClientDialog = false;
  newClientSiteDialog = false;
  editClientSiteDialog = false;
  newPOCDialog = false;
  editPOCDialog = false;
  viewClientDialog = false;
  viewClientSiteDialog = false;
  viewPOCDialog = false;
  



  newClientForm = new FormGroup({
    companyName: new FormControl(''),
    comments: new FormControl('')
  })

  newClientSiteForm = new FormGroup({
    client_id: new FormControl(''),
    name: new FormControl(''),
    address: new FormControl(''),
    comments: new FormControl('')
  })

  newPOCForm = new FormGroup({
    client_id: new FormControl(''),
    name: new FormControl(''),
    email: new FormControl(''),
    phone: new FormControl(''),
    job_title: new FormControl(''),
    comments: new FormControl('')
  })

  @Output() client_id = new EventEmitter();
  
  constructor( @Inject(MAT_DIALOG_DATA) public data: {step: string, client_id: number, client_site_id:number, point_of_contact_id:number}, private service: HttpRequestService, public dialog: MatDialog,
  private route: ActivatedRoute, private router: Router, private dialogRef: MatDialogRef<ClientManagerComponent>) { }

  ngOnInit(): void {
    console.log(this.data.step);

    

    if(this.data.step=="Client"){
      this.newClientDialog = true;
      this.editClientDialog = false;
      this.newClientSiteDialog = false;
      this.editClientSiteDialog = false;
      this.newPOCDialog = false;
      this.editPOCDialog = false;
      this.viewClientDialog = false;
      this.viewClientSiteDialog = false;
      this.viewPOCDialog = false;

    }else if(this.data.step=="Edit Client"){
      this.newClientDialog = false;
      this.editClientDialog = true;
      this.newClientSiteDialog = false;
      this.editClientSiteDialog = false;
      this.newPOCDialog = false;
      this.editPOCDialog = false;
      this.viewClientDialog = false;
      this.viewClientSiteDialog = false;
      this.viewPOCDialog = false;

      this.service.getClient(this.data.client_id).subscribe((result:any)=>{
        console.log(result[0]);
        this.newClientForm.patchValue(result[0]);
      });

    }else if (this.data.step == "Site"){
      this.newClientDialog = false;
      this.editClientDialog = false;
      this.newClientSiteDialog = true;
      this.editClientSiteDialog = false;
      this.newPOCDialog = false;
      this.editPOCDialog = false;
      this.viewClientDialog = false;
      this.viewClientSiteDialog = false;
      this.viewPOCDialog = false;

    }else if(this.data.step=="Edit Client Site"){
      this.newClientDialog = false;
      this.editClientDialog = false;
      this.newClientSiteDialog = false;
      this.editClientSiteDialog = true;
      this.newPOCDialog = false;
      this.editPOCDialog = false;
      this.viewClientDialog = false;
      this.viewClientSiteDialog = false;
      this.viewPOCDialog = false;

      this.service.getClientSite(this.data.client_site_id, this.data.client_id).subscribe((result:any)=>{
        console.log(result[0]);
        this.newClientSiteForm.patchValue(result[0]);
      });
      

    }else if (this.data.step == "Contact"){
      this.newClientDialog = false;
      this.editClientDialog = false;
      this.newClientSiteDialog = false;
      this.editClientSiteDialog = false;
      this.newPOCDialog = true;
      this.editPOCDialog = false;
      this.viewClientDialog = false;
      this.viewClientSiteDialog = false;
      this.viewPOCDialog = false;


    }else if(this.data.step=="Edit POC"){
      this.newClientDialog = false;
      this.editClientDialog = false;
      this.newClientSiteDialog = false;
      this.editClientSiteDialog = false;
      this.newPOCDialog = false;
      this.editPOCDialog = true;
      this.viewClientDialog = false;
      this.viewClientSiteDialog = false;
      this.viewPOCDialog = false;

      this.service.getPointOfContact(this.data.point_of_contact_id, this.data.client_id).subscribe((result:any)=>{
        console.log(result[0]);
        this.newPOCForm.patchValue(result[0]);
      });


    }else if(this.data.step=="View Client"){
      this.newClientDialog = false;
      this.editClientDialog = false;
      this.newClientSiteDialog = false;
      this.editClientSiteDialog = false;
      this.newPOCDialog = false;
      this.editPOCDialog = false;
      this.viewClientDialog = true;
      this.viewClientSiteDialog = false;
      this.viewPOCDialog = false;

      this.newClientForm.disable();

      this.service.getClient(this.data.client_id).subscribe((result:any)=>{
        this.newClientForm.patchValue(result[0]);
      });

    }else if(this.data.step=="View Client Site"){
      this.newClientDialog = false;
      this.editClientDialog = false;
      this.newClientSiteDialog = false;
      this.editClientSiteDialog = false;
      this.newPOCDialog = false;
      this.editPOCDialog = false;
      this.viewClientDialog = false;
      this.viewClientSiteDialog = true;
      this.viewPOCDialog = false;
      this.newClientSiteForm.disable();

      this.service.getClientSite(this.data.client_site_id, this.data.client_id).subscribe((result:any)=>{
        console.log(result[0]);
        this.newClientSiteForm.patchValue(result[0]);
      });

    }else if(this.data.step=="View POC"){
      this.newClientDialog = false;
      this.editClientDialog = false;
      this.newClientSiteDialog = false;
      this.editClientSiteDialog = false;
      this.newPOCDialog = false;
      this.editPOCDialog = false;
      this.viewClientDialog = false;
      this.viewClientSiteDialog = false;
      this.viewPOCDialog = true;
      this.newPOCForm.disable();

      this.service.getPointOfContact(this.data.point_of_contact_id, this.data.client_id).subscribe((result:any)=>{
        console.log(result[0]);
        this.newPOCForm.patchValue(result[0]);
      });
    }
    // this.route.paramMap.subscribe((params) => {
    //   let id = +params.get('id')!;
    //   this.service.getQuote(+id).subscribe((response: Quote[]) => {
    //     this.quote = response[0];
  }

  createClient(){
    console.log("Saving new Client");
    console.log(JSON.stringify( this.newClientForm.value));
    this.dialogRef.close({ data: this.service.createClient(this.newClientForm.value) });
  }

  editClient(){
    console.log("Editing Client");
    console.log(JSON.stringify( this.newClientForm.value));
    this.dialogRef.close({ data: this.newClientForm.value });
  }

  createClientSite(){
    console.log("Saving new Client Site");
    console.log(JSON.stringify( this.newClientSiteForm.value));
    this.dialogRef.close({ data: this.newClientSiteForm.value});
  }

  editClientSite(){
    console.log("Editing Client Site");
    console.log(JSON.stringify( this.newClientSiteForm.value));
    this.dialogRef.close({ data: this.newClientSiteForm.value });
  }

  createPointOfContact(){
    console.log("Saving new Point of Contact");
    console.log(JSON.stringify( this.newPOCForm.value));
    this.dialogRef.close({ data: this.newPOCForm.value});
  }

  editPointOfContact(){
    console.log("Editing Client");
    console.log(JSON.stringify( this.newPOCForm.value));
    this.dialogRef.close({ data: this.newPOCForm.value });
  }

}



      
        
        
      

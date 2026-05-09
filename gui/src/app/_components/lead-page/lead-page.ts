//Angular
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

//RXJS Observables
import { Observable } from 'rxjs';
import {map, startWith} from 'rxjs/operators';

//Material
import { MatDialog } from '@angular/material/dialog';

import {createForm} from '../../utils/pdf_generator';

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

//Models
import { Lead } from '../../_models/lead';
import { User } from '../../_models/user';
import { Client, ClientSite, PointOfContact } from 'src/app/_models/client';

//Components
import { ClientManagerComponent } from '../client-manager/client-manager';

//Services
import { HttpRequestService } from 'src/app/_services/httpRequest.service';


@Component({
  selector: 'app-lead-page',
  templateUrl: './lead-page.html',
  styleUrls: ['./lead-page.css']
})
export class LeadPageComponent implements OnInit {

  // @ViewChild('htmlData') htmlData:ElementRef;

  newInstance!: Boolean;
  lead!: Lead;
  users: User[] = [];
  clients: Client[] = [];
  clientNames!: string[];
  client_sites: ClientSite[] = [];
  point_of_contacts: PointOfContact[] = [];

  client_id = 0;

  leadForm = new FormGroup({
    lead_id: new FormControl(),
    assigned_employee_id: new FormControl(),
    state_id: new FormControl(0),
    title: new FormControl('', [Validators.required]),
    dateCreated: new FormControl(''),
    dateReceived: new FormControl('', [Validators.required]),
    dueDate: new FormControl('', [Validators.required]),
    projectDescription: new FormControl(''),
    client_id: new FormControl('', [Validators.required]),
    client_site_id: new FormControl('', [Validators.required]),
    point_of_contact_id: new FormControl('', [Validators.required]),
    comments: new FormControl(''),
    client_name: new FormControl('', [Validators.required]),
    client_site_name: new FormControl('', [Validators.required]),
    point_of_contact_name: new FormControl('', [Validators.required]),
    assigned_employee_name: new FormControl('', [Validators.required]),
    current_employee_id: new FormControl(''),
    state_name: new FormControl(''),

  })

  client_selected = 0;
  client_site_selected = 0;
  poc_selected = 0;
  user_selected = 0;

  client_site_enable = false;
  poc_enable = false;

   
  

  filteredOptions!: Observable<string[]>;

  constructor(private route: ActivatedRoute, private router: Router, private service: HttpRequestService, public dialog: MatDialog ) { }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();

    return this.clientNames.filter(option => option.toLowerCase().includes(filterValue));
  }


  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {

      let id = params.get('id')!;

      
     
      //Create button was pressed
      if(+id == 0){
        this.newInstance = true;	
        this.getAllClients();
        this.getAllUsers();
      //Lead selected in lead table
      }else{
        this.newInstance = false;
        this.service.getLead(+id).subscribe((response: Lead[]) => {
          this.client_site_enable = true;
          this.poc_enable = true;

          this.lead = response[0];
          this.leadForm.patchValue(this.lead);
         
          this.client_selected = this.lead.client_id;
          this.client_site_selected = this.lead.client_site_id;
          this.poc_selected = this.lead.point_of_contact_id;
          this.user_selected = this.lead.assigned_employee_id;      

          this.getAllClients();
          this.getAllUsers();
          this.getAllClientSites();
          this.getAllPointOfContacts();

          this.service.getClient(this.leadForm.value.client_id).subscribe((client:any)=>{
            this.leadForm.patchValue({
              client_name: client[0].companyName
            });
          });
          this.service.getClientSite(this.leadForm.value.client_site_id, this.leadForm.value.client_id).subscribe((client_site:any)=>{
            this.leadForm.patchValue({
              client_site_name: client_site[0].name
            });
          });
          this.service.getPointOfContact(this.leadForm.value.point_of_contact_id, this.leadForm.value.client_id).subscribe((poc:any)=>{
            this.leadForm.patchValue({
              point_of_contact_name: poc[0].name
            });
          });
          
        })
      };
    });
       
    console.log("This is a new Instance t/f = " + this.newInstance + " The Lead info is " + this.lead);
      
}

  displayFn(user: Client): string {
    return user && user.companyName ? user.companyName : '';
  }

  getAllUsers(): void {
    this.service.getUsers()
      .subscribe((users: User[]) => {
        this.users =users;
        console.log(this.users);
        console.log(typeof users);
     
      });
  }

  selectUser(user_id: String){
    this.leadForm.patchValue({
      assigned_employee_id: user_id
    });
  }

  refresh(){
    this.leadForm.setValue(this.leadForm);
  }

  openDialogNewClient(){
    console.log("Clicked the right button");
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Client"}});
      dialogRef.afterClosed().subscribe(res => {
        // received data from dialog-component
        res.data.subscribe((result: any) => {
          this.service.getClient(result.client_id).subscribe((client: any)=>{
            const createdClient = client[0];

            this.client_id = result.client_id;
            this.leadForm.patchValue({
              client_id: createdClient.client_id,
              client_name: createdClient.companyName,
              client_site_id: '',
              client_site_name: '',
              point_of_contact_id: '',
              point_of_contact_name: ''
            });
            this.client_sites = [];
            this.point_of_contacts = [];
            this.client_site_enable = true;
            this.poc_enable = true;
            this.getAllClients();
            this.getAllClientSites();
            this.getAllPointOfContacts();

          });
        });
      });
  }

  getAllClients(): void {
    this.service.getClients()
      .subscribe((clients: Client[]) => {
        this.clients = clients;
        console.log(this.clients);
        console.log(typeof clients);
      });
  }

  getSelectedClientName(): string {
    const clientId = Number(this.leadForm.value.client_id);
    const client = this.clients.find((item) => item.client_id === clientId);

    return client ? client.companyName : this.leadForm.value.client_name || '';
  }

  getSelectedClientSiteName(): string {
    const clientSiteId = Number(this.leadForm.value.client_site_id);
    const clientSite = this.client_sites.find((item) => item.client_site_id === clientSiteId);

    return clientSite ? clientSite.name : this.leadForm.value.client_site_name || '';
  }

  getSelectedPointOfContactName(): string {
    const pointOfContactId = Number(this.leadForm.value.point_of_contact_id);
    const pointOfContact = this.point_of_contacts.find((item) => item.point_of_contact_id === pointOfContactId);

    return pointOfContact ? String(pointOfContact.name) : this.leadForm.value.point_of_contact_name || '';
  }

  selectClient(client_id: number){
    const client = this.clients.find((item) => item.client_id === client_id);

    this.leadForm.patchValue({
      client_id: client_id,
      client_name: client ? client.companyName : '',
      client_site_id: '',
      client_site_name: '',
      point_of_contact_id: '',
      point_of_contact_name: ''
    });

    this.client_site_selected = 0;
    this.poc_selected = 0;
    this.client_sites = [];
    this.point_of_contacts = [];

    this.client_site_enable = true;
    this.poc_enable = true;

    this.getAllClientSites();
    this.getAllPointOfContacts();

  }

  editClient(client_id:number){
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Edit Client", client_id: this.leadForm.value.client_id}});
    dialogRef.afterClosed().subscribe(res => {
      console.log(res.data);
      // received data from dialog-components
        this.service.editClient(res.data, client_id).subscribe((result:any) => {
          this.getAllClients();
        });
      });
  }

  getClientInfo(client_id:number){
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "View Client", client_id: client_id}});
  }

  getAllClientSites(): void {
    const clientId = Number(this.leadForm.value.client_id);

    if(clientId){
      this.service.getClientSites(clientId)
        .subscribe((client_sites: ClientSite[]) => {
          this.client_sites = client_sites;
          console.log(this.client_sites);
          console.log(typeof client_sites);
        });
    } else {
      this.client_sites = [];
    }
  }

  selectClientSite(client_site_id: number){
    const clientSite = this.client_sites.find((item) => item.client_site_id === client_site_id);

    this.leadForm.patchValue({
      client_site_id: client_site_id,
      client_site_name: clientSite ? clientSite.name : ''
    });

    this.poc_enable = true;
  }

  editClientSite(client_site_id:number){
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Edit Client Site", client_site_id: this.leadForm.value.client_site_id, client_id: this.leadForm.value.client_id}});
    dialogRef.afterClosed().subscribe(res => {
      res.data.client_id = this.leadForm.value.client_id;
      console.log(res.data);
      // received data from dialog-components
        this.service.editClientSite(res.data, client_site_id, this.leadForm.value.client_id).subscribe((result:any) => {
          this.getAllClientSites();
        });
      });
  }

  getClientSiteInfo(client_site_id:number, client_id:number){
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "View Client Site", client_id: client_id, client_site_id: client_site_id}});
  }

  getAllPointOfContacts(): void {
    const clientId = Number(this.leadForm.value.client_id);

    if(clientId){
      this.service.getPointOfContacts(clientId)
        .subscribe((poc: PointOfContact[]) => {
          this.point_of_contacts = poc;
          console.log(this.point_of_contacts);
          console.log(typeof this.point_of_contacts);
        });
    } else {
      this.point_of_contacts = [];
    }
  }

  selectPointOfContact(point_of_contact_id: number){
    const pointOfContact = this.point_of_contacts.find((item) => item.point_of_contact_id === point_of_contact_id);

    this.leadForm.patchValue({
      point_of_contact_id: point_of_contact_id,
      point_of_contact_name: pointOfContact ? String(pointOfContact.name) : ''
    });
  }

  getPointOfContactInfo(point_of_contact_id:number, client_id:number){
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "View POC", client_id: client_id, point_of_contact_id: point_of_contact_id}});
  }


  openDialogNewClientSite(){
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Site", client_site_id: this.leadForm.value.client_site_id, client_id: this.leadForm.value.client_id}});
      dialogRef.afterClosed().subscribe(res => {
        console.log(res.data);
        // received data from dialog-components
          this.service.createClientSite(res.data, this.leadForm.value.client_id).subscribe((result:any) => {
            this.service.getClientSite(result.client_site_id, this.leadForm.value.client_id).subscribe((client_site:any) => {
              console.log(client_site[0]);
              this.leadForm.patchValue({
                client_site_id: client_site[0].client_site_id,
                client_site_name: client_site[0].name
              });
              this.getAllClientSites();
            });
          });
        });
  }

  openDialogNewPOC(){
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Contact"}});
      dialogRef.afterClosed().subscribe(res => {
        // received data from dialog-components\
        console.log("this.client = "+res.data);
          this.service.createPointOfContact(res.data, this.leadForm.value.client_id).subscribe((result:any) => {
            console.log(result);
            this.service.getPointOfContact(result.poc_id, this.leadForm.value.client_id).subscribe((point_of_contact:any) => {
              console.log(point_of_contact[0]);
              this.leadForm.patchValue({
                point_of_contact_id: point_of_contact[0].point_of_contact_id,
                point_of_contact_name: point_of_contact[0].name
              });
              this.getAllPointOfContacts();
            });
          });
        });
  }

  editPointOfContact(poc_id:number){
    let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Edit POC", point_of_contact_id: this.leadForm.value.point_of_contact_id, client_id: this.leadForm.value.client_id}});
    dialogRef.afterClosed().subscribe(res => {
      res.data.client_id = this.leadForm.value.client_id;
      console.log(res.data);
      // received data from dialog-components
        this.service.editPointOfContact(res.data, poc_id, this.leadForm.value.client_id).subscribe((result:any) => {
          this.getAllPointOfContacts();
        });
      });
  }

  createLead(){
    if(this.leadForm.value.title && this.leadForm.value.dateReceived && this.leadForm.value.dueDate
      && this.leadForm.value.client_id && this.leadForm.value.client_site_id && this.leadForm.value.point_of_contact_id 
      && this.leadForm.value.assigned_employee_id){
      
          this.leadForm.patchValue({
            state_id: 1
          });
          this.service.submitLead(this.leadForm.value);
          alert("Lead created.");
          this.router.navigate(['/lDashboard']);

    }else{
      alert("Fix the errors.");
    }
  }

  updateLead(){
    console.log(this.leadForm.value);
    this.service.updateLead(this.leadForm.value);
    alert("Lead updated.");
    this.router.navigate(['/lDashboard']);
  }

  archiveLead(){
    this.leadForm.patchValue({
      state_id: 3
    });
    this.service.updateLead(this.leadForm.value);
    this.router.navigate(['/lDashboard']);
  }

  createQuote(){
    
    this.leadForm.patchValue({
      current_employee_id: this.leadForm.value.assigned_employee_id,
      state_id: 2,
      state_name: this.service.getState(2),
      dateCreated: this.getDate()
    });

    console.log(this.leadForm.value);
    var quote = this.leadForm.value;
    quote.r2_id = 0;
    quote.proposalSpecifications = ' ';
    this.service.submitQuote(quote).subscribe((res:any)=>{
      //Update r2_id
      this.service.getQuote(res.quote_id).subscribe((quote:any)=>{
        quote[0].r2_id = this.getR2ID(res.quote_id);
        quote[0].state_id= 1;
        quote[0].proposalSpecifications = '';
        console.log(quote);
        this.service.editQuote(quote[0]).subscribe((res:any)=>{
          alert("Quote created.");
          this.router.navigate(['/qDashboard']);
        });
      });
     });
    this.service.updateLead(quote);
    //Redirect to
  }

  public savePDF():void {
    let DATA = document.getElementById('htmlData');
    if(DATA){
        html2canvas(DATA).then(canvas => {
          
          let fileWidth = canvas.width;
          let fileHeight = canvas.height * fileWidth / canvas.width;
          
          const FILEURI = canvas.toDataURL('image/png')
          let PDF = new jsPDF('p', 'mm', 'a4');
          let position = 0;
          PDF.addImage(FILEURI, 'PNG', 0, position, fileWidth, fileHeight)
          
          PDF.save(`${new Date()}.pdf`);
        });  
    }
       
  }

  cancel(){
    this.router.navigate(['/lDashboard']);

  }

  getDate(){
    var today = new Date();
    var dd = String(today.getDate()).padStart(2, '0');
    var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
    var yyyy = today.getFullYear();

    return yyyy + '-' + mm + '-' + dd;
  }

  getR2ID(id:number){
    var date = new Date();
    var year = date.getFullYear();
    return "QM" +  year.toString().substr(-2) +("000" + id).slice(-4);
  }

}

  


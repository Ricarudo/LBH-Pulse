//Angular
import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

//PDF
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

//Material
import { MatDialog } from '@angular/material/dialog';



//Models
import { Quote } from '../../_models/quote';
import { User } from '../../_models/user';
import { Client, ClientSite, PointOfContact } from 'src/app/_models/client';

//Services
import { HttpRequestService } from 'src/app/_services/httpRequest.service';
import { Item } from 'src/app/_models/item';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AuthenticationResult, EventMessage, EventType, InteractionStatus } from '@azure/msal-browser';
import { filter, subscribeOn, takeUntil } from 'rxjs/operators';

//Components
import { ClientManagerComponent } from '../client-manager/client-manager';
import { CostCalculator } from 'src/app/_services/costCalculator.service';
import { ItemManagerComponent } from '../item-manager/item-manager';
import { Entry, LaborCost } from 'src/app/_models/entry';



// Imports for PDF Generation
// import * as jspdf from 'jspdf';
// import html2canvas from 'html2canvas';




@Component({
  selector: 'app-quote-page',
  templateUrl: './quote-page.html',
  styleUrls: ['./quote-page.css']
})
export class QuotePageComponent implements OnInit {

  quote!: Quote;
  items!: Item[];
  users!: User[];
  clients!: Client[];
  clientNames!: string[];
  client_sites!: ClientSite[];
  point_of_contacts!: PointOfContact[];
  entries!: Entry[];
  math = Math;
  selected!: string;


  client_id = 0;

  client_selected = 0;
  client_site_selected = 0;
  poc_selected = 0;
  user_selected = 0;
  item_selected = [];
  

  //Calculation Variables
  ratio = 0;
  totalLaborCost = 0;
  totalMaterialCost = 0;
  totalProjectCost = 0;



  client_site_enable = false;
  poc_enable = false;

  sent_to_approve = false;

  user_role: any =[];
  user_id: any = [];

  
  inputFormControl = new FormControl({ value: null, disabled: true });


  quoteForm = new FormGroup({
    quote_id: new FormControl(''),
    lead_id: new FormControl(''),
    r2_id: new FormControl(''),
    title: new FormControl(''),
    current_employee_id: new FormControl(''),
    current_employee_name: new FormControl(''),
    dateReceived: new FormControl(''),
    dueDate: new FormControl(''),
    dateCreated: new FormControl(''),
    state_id: new FormControl(''),
    state_name: new FormControl(''),
    projectDescription: new FormControl(''),
    client_id: new FormControl(''),
    client_name: new FormControl(''),
    client_site_id: new FormControl(''),
    comments: new FormControl(''),
    client_site_name: new FormControl(''),
    point_of_contact_id: new FormControl(''),
    point_of_contact_name: new FormControl(''),
    proposalSpecifications: new FormControl('')
  })

  bomForm: FormGroup;


  


  

  constructor(private route: ActivatedRoute, private router: Router, private service: HttpRequestService,private calculator: CostCalculator, 
    private fb:FormBuilder, public dialog: MatDialog, private authService: MsalService,private msalBroadcastService: MsalBroadcastService) { 
    this.bomForm = this.fb.group({
      billEntries: this.fb.array([])
    })


    this.inputFormControl.disable();


  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      let id = +params.get('id')!;
      console.log(id);
      this.service.getQuote(+id).subscribe((response: any) => {
        this.quote = response[0];
        console.log(this.quote);
        this.quoteForm.patchValue(this.quote);

        this.quoteForm.patchValue({
          state_name: this.service.getState(this.quote.state_id)
        });

        this.client_selected = this.quote.client_id;      
        this.client_site_selected = this.quote.client_site_id;
        this.poc_selected = this.quote.point_of_contact_id;
        this.user_selected = this.quote.current_employee_id;

        this.client_site_enable = true;
        this.poc_enable = true;

        if(this.quote.state_id == 6){
          this.sent_to_approve = true;
        }

        this.getAllClients();
        this.getAllUsers();
        this.getAllClientSites();
        this.getAllPointOfContacts();
        this.getAllEntries();
        this.getAllItems();

        this.service.getClient(this.quoteForm.value.client_id).subscribe((client:any)=>{
          this.quoteForm.patchValue({
            client_name: client[0].companyName
          });
        });
        this.service.getClientSite(this.quoteForm.value.client_site_id, this.quoteForm.value.client_id).subscribe((client:any)=>{
          this.quoteForm.patchValue({
            client_site_name: client[0].name
          });
        });
        this.service.getPointOfContact(this.quoteForm.value.point_of_contact_id, this.quoteForm.value.client_id).subscribe((poc:any)=>{
          this.quoteForm.patchValue({
            point_of_contact_name: poc[0].name
          });
        });

      
        //Get credentials
        this.msalBroadcastService.inProgress$
        .pipe(
          filter((status: InteractionStatus) => status === InteractionStatus.None)
        )
        .subscribe(() => {
          this.checkAndSetActiveAccount();
          this.getClaims(this.authService.instance.getActiveAccount()?.idTokenClaims);   
        });
      })
    })

    this.billEntries().valueChanges.subscribe( selectedValue =>{
      this.totalLaborCost = this.calculator.calcLaborCost(this.billEntries());
      this.totalMaterialCost = this.calculator.calcMaterialCost(this.billEntries());
      this.ratio = this.calculator.getRatio()
      this.totalProjectCost = this.totalMaterialCost + this.totalLaborCost;
    });


  

  }

//-------------- Authentication ------------------------------------


  checkAndSetActiveAccount() {
    /**
     * If no active account set but there are accounts signed in, sets first account to active account
     * To use active account set here, subscribe to inProgress$ first in your component
     * Note: Basic usage demonstrated. Your app may require more complicated account selection logic
     */
    let activeAccount = this.authService.instance.getActiveAccount();

    if (!activeAccount && this.authService.instance.getAllAccounts().length > 0) {
      let accounts = this.authService.instance.getAllAccounts();
      this.authService.instance.setActiveAccount(accounts[0]);
    }
  }

  getClaims(claims: any) {
    this.user_role = claims ? claims['roles']: null;  
    this.user_id = claims ? claims['oid']: null;  
  }

//-------------- Users, Clients, ClienSites and POC ------------------------------------



getAllUsers(): void {
  this.service.getUsers()
    .subscribe((users: User[]) => {
      this.users =users;
      console.log(this.users);
      console.log(typeof users); 
    });
}

selectUser(user_id: String){
  this.quoteForm.patchValue({
    assigned_employee_id: user_id
  });
}

refresh(){
  this.quoteForm.setValue(this.quoteForm);
}

openDialogNewClient(){
  let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Client"}});
    dialogRef.afterClosed().subscribe(res => {
      // received data from dialog-component
      res.data.subscribe((result: any) => {
        this.service.getClient(result.client_id).subscribe((client: any)=>{
          this.client_id = result.client_id;
          this.quoteForm.patchValue({
            client_id: client[0].client_id,
            client_name: client[0].companyName
          });
          this.getAllClients();
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

selectClient(client_id: number){
  this.quoteForm.patchValue({
    client_id: client_id
  });

  this.client_site_enable = true;
  this.client_site_selected = 0;
  this.poc_selected = 0;

  this.getAllClientSites();
  this.getAllPointOfContacts();
}

editClient(client_id:number){
  let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Edit Client", client_id: this.quoteForm.value.client_id}});
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
  if(this.quoteForm.value.client_id!=0){
    this.service.getClientSites(this.quoteForm.value.client_id)
      .subscribe((client_sites: ClientSite[]) => {
        this.client_sites = client_sites;
        console.log(this.client_sites);
        console.log(typeof client_sites);
      });
  }
}

selectClientSite(client_site_id: number){
  this.quoteForm.patchValue({
    client_site_id: client_site_id
  });

  this.poc_enable = true;
}

editClientSite(client_site_id:number){
  let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Edit Client Site", client_site_id: client_site_id, client_id: this.quoteForm.value.client_id}});
  dialogRef.afterClosed().subscribe(res => {
    res.data.client_id = this.quoteForm.value.client_id;
    console.log(res.data);
    // received data from dialog-components
      this.service.editClientSite(res.data, client_site_id, this.quoteForm.value.client_id).subscribe((result:any) => {
        this.getAllClientSites();
      });
    });
}

getClientSiteInfo(client_site_id:number, client_id:number){
  let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "View Client Site", client_id: client_id, client_site_id: client_site_id}});
}

getAllPointOfContacts(): void {
  if(this.quoteForm.value.client_id!=0){
    this.service.getPointOfContacts(this.quoteForm.value.client_id)
      .subscribe((poc: PointOfContact[]) => {
        this.point_of_contacts = poc;
        console.log(this.point_of_contacts);
        console.log(typeof this.point_of_contacts);
      });
  }
}

selectPointOfContact(point_of_contact_id: number){
  this.quoteForm.patchValue({
    point_of_contact_id: point_of_contact_id
  });
}

getPointOfContactInfo(point_of_contact_id:number, client_id:number){
  let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "View POC", client_id: client_id, point_of_contact_id: point_of_contact_id}});
}



openDialogNewClientSite(){
  let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Site"}});
    dialogRef.afterClosed().subscribe(res => {
      console.log(res.data);
      // received data from dialog-components
        this.service.createClientSite(res.data, this.quoteForm.value.client_id).subscribe((result:any) => {
          this.service.getClientSite(result.client_site_id, this.quoteForm.value.client_id).subscribe((client_site:any) => {
            console.log(client_site[0]);
            this.quoteForm.patchValue({
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
        this.service.createPointOfContact(res.data, this.quoteForm.value.client_id).subscribe((result:any) => {
          console.log(result);
          this.service.getPointOfContact(result.poc_id, this.quoteForm.value.client_id).subscribe((point_of_contact:any) => {
            console.log(point_of_contact[0]);
            this.quoteForm.patchValue({
              point_of_contact_id: point_of_contact[0].point_of_contact_id,
              point_of_contact_name: point_of_contact[0].name
            });
            this.getAllPointOfContacts();
          });
        });
      });
}

editPointOfContact(poc_id:number){
  let dialogRef = this.dialog.open(ClientManagerComponent,{data: {step: "Edit POC", point_of_contact_id: this.quoteForm.value.point_of_contact_id, client_id: this.quoteForm.value.client_id}});
  dialogRef.afterClosed().subscribe(res => {
    res.data.client_id = this.quoteForm.value.client_id;
    console.log(res.data);
    // received data from dialog-components
      this.service.editPointOfContact(res.data, poc_id, this.quoteForm.value.client_id).subscribe((result:any) => {
        this.getAllPointOfContacts();
      });
    });
}


getAllItems(): void {
  this.service.getItems()
    .subscribe((items: Item[]) => {
      this.items = items;
      console.log(this.items);
      console.log(typeof items);
    });
}

selectItem(item_id: number, array_pos: number){
 
  this.service.getItem(item_id).subscribe((result:any)=>{
    this.billEntries().at(array_pos).patchValue( {
      item_id: item_id,
      item_name: result[0].name
    });
  });
}

openDialogNewItem(){
  let dialogRef = this.dialog.open(ItemManagerComponent,{data:{step: "Create"}});
    dialogRef.afterClosed().subscribe(res => {
      res.data.subscribe((result:any)=>{
      // received data from dialog-components
        this.service.getItem(result.item_id).subscribe((item:any) => {
          //do something with the item if you need to.
        });
      });
    });
}

editItem(item_id:number){
  let dialogRef = this.dialog.open(ItemManagerComponent,{data: {step: "Edit", item_id:item_id}});
  dialogRef.afterClosed().subscribe(res => {
    console.log(res.data);
    // received data from dialog-components
     this.service.editItem(res.data, item_id).subscribe((result:any) => {
        this.getAllItems();
      });
    });

}

getItemInfo(item_id:number){
  let dialogRef = this.dialog.open(ItemManagerComponent,{data: {step: "View", item_id: item_id}});
}

getAllEntries(){
  console.log("getting Entries")
  
  this.service.getQuoteEntries(this.quoteForm.get("quote_id")?.value).subscribe((entries: Entry[])=>{
    console.log("These are the entries of this quote: " + entries);
    this.entries = entries;
    if(entries.length == 0){
      this.addBillEntry();
    }
    for(let i=0;i<this.entries.length;i++){
      
      this.addBillEntry();
      this.billEntries().controls[i].patchValue(this.entries[i]);
      
      this.service.getItem(this.billEntries().controls[i].value.item_id).subscribe((result:any)=>{
        this.billEntries().controls[i].patchValue({
          item_name: result[0].name
        });
      });
      
    } 
  });
}

archiveQuote(){
  this.quoteForm.patchValue({
    state_id: 3
  });
  console.log(this.quoteForm.value);
  this.service.editQuote(this.quoteForm.value).subscribe();
  this.router.navigate(['/qDashboard']);
}

markAsWonQuote(){
  this.quoteForm.patchValue({
    state_id: 4
  });
  console.log(this.quoteForm.value);
  this.service.editQuote(this.quoteForm.value).subscribe();
  this.router.navigate(['/qDashboard']);
}

markAsLostQuote(){
  this.quoteForm.patchValue({
    state_id: 5
  });
  console.log(this.quoteForm.value);
  this.service.editQuote(this.quoteForm.value).subscribe();
  this.router.navigate(['/qDashboard']);
}

sendToApprovalQuote(){
  this.quoteForm.patchValue({
    state_id: 6
  });
  console.log(this.quoteForm.value);
  this.service.editQuote(this.quoteForm.value).subscribe();
  this.router.navigate(['/qDashboard']);
}

approveQuote(){
  this.quoteForm.patchValue({
    state_id: 7
  });
  console.log(this.quoteForm.value);
  this.service.editQuote(this.quoteForm.value).subscribe();
  this.router.navigate(['/qDashboard']);
}

sendToRevisionQuote(){
  this.quoteForm.patchValue({
    state_id: 8
  });
  console.log(this.quoteForm.value);
  this.service.editQuote(this.quoteForm.value).subscribe();
  this.router.navigate(['/qDashboard']);
}

saveQuote(){
  console.log("Saving Quote....")
  this.saveEntries();

}

saveEntries(){
  console.log("Trying to save entries");
  for( let control of this.billEntries().controls){
    console.log("control = "+control.value);
    if (control.get("bill_of_materials_entry_id")?.value == 0){
      //TODO - Fix Database Entries on Backend
      console.log("Creating new Entry");
      
      const entryValues = { 
                            quote_id: this.quoteForm.get('quote_id')?.value, 
                            item_id: control.get('item_id')?.value,
                            quantity: control.get('quantity')?.value,
                            workers: control.get('workers')?.value,
                            unitHours: control.get('unitHours')?.value,
                            rate: control.get('rate')?.value,
                            materialCost: control.get('materialCost')?.value,
                            contingencyPercent: control.get('contingencyPercent')?.value,
                            freightPercent: control.get('freightPercent')?.value,
                            profitMarkup: control.get('profitMarkup')?.value,
                            supplier: control.get('supplier')?.value,
                          }
      this.service.createQuoteEntry(this.quoteForm.get('quote_id')?.value, entryValues).subscribe(res => {
        control.patchValue({
          bill_of_materials_entry_id: res.bill_of_materials_entry_id
        });
      });
    }else{
      console.log("This is not a new Entry");
    }

  }
}


//--------------Bill Of Material Form Builders and Modifiers-----------------------------

  billEntries(){
    return this.bomForm.get("billEntries") as FormArray;
  }
  newBillEntry(){
    return this.fb.group({
      bill_of_materials_entry_id: 0,
      //BOM ITEMS
      item: '', 
      item_name: '',
      item_id:'',
      quantity:'',
      //Labor Cost Items
      workers: '',
      unitHours: '',
      rate: '',
      total: '',
      unitLaborCost:'',
      //MaterialCost
      materialCost: '',
      contingency: '',
      freight:'',
      profit:'',
      taxes:'',
      contingencyPercent:'',
      freightPercent:'',
      profitMarkup:'',
      supplier:'',
      exitMaterialCost: '',

    })
  }

  addBillEntry(){
    this.billEntries().push(this.newBillEntry());

  }

  removeBillEntry(i: number){
    this.billEntries().removeAt(i);
  }
  getBillControls() {
    return (this.bomForm.get('billEntries') as FormArray).controls;
 }

  logAllBillEntries(){
    console.log(this.bomForm.value)
  }

//--------------Bill Of Material Form Builders and Modifiers END-----------------------------





 
  
//HTTP Request Forms

  //Create New Items


  editQuote(quote: Quote): void {
    this.quote.projectDescription = quote.projectDescription;
    this.service.editQuote(this.quote).subscribe(() => {
        this.router.navigate(['/dashboard']);
    })
  }

//Material Dialog Popups



calculateLaborCost(line: FormControl){
  console.log(line);
  
  console.log(this.billEntries().getRawValue());
  console.log("Calculating Labor Cost")
}

roundTwoDecimals(num:number){
  const factor = 10 ** 2;
  return Math.round(num * factor) / factor;
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

}
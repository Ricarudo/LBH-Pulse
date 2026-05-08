//Angular
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

//Models
import { Quote } from '../../_models/quote';

//Services
import { HttpRequestService } from 'src/app/_services/httpRequest.service';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AuthenticationResult, EventMessage, EventType, InteractionStatus } from '@azure/msal-browser';
import { filter, takeUntil } from 'rxjs/operators';


@Component({
  selector: 'app-qDashboard',
  templateUrl: './qDashboard.html',
  styleUrls: ['./qDashboard.css']
})
export class QDashboardComponent implements OnInit {

  users: string[] = [];
  quotes: Quote[] = [];
  displayedColumns: string[] = ['r2 id', 'title', 'state_id', 'description','client','clientsite','poc','dateReceived','dueDate'];
  table: any = [];
  user_role: any =[];
  user_id: any = [];

  constructor(private route: ActivatedRoute, private authService: MsalService, private router: Router, private service: HttpRequestService, private msalBroadcastService: MsalBroadcastService) { }

  ngOnInit(): void {
    //this.getAll();
    this.msalBroadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None)
      )
      .subscribe(() => {
        this.checkAndSetActiveAccount();
        this.getClaims(this.authService.instance.getActiveAccount()?.idTokenClaims);
        if(this.user_role=="User.Estimator"){
          this.getUserQuotes(this.user_id);
        }else{
          this.getAll();
        }
        
      });
  }


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


  getAll(): void {
    this.service.getQuotes()
      .subscribe((quotes: Quote[]) => {
        this.quotes = quotes;
        this.tabulateQuotes();
      });
  }

  getUserQuotes(user_id:any){ 
    this.service.getUserQuotes(this.user_id)
    .subscribe((quotes: Quote[]) => {
      this.quotes = quotes;
      this.tabulateQuotes();
    });
    
  }

  tabulateQuotes(){
    for(let quote of this.quotes) {
        quote.state_name = this.service.getState(quote.state_id);
      this.service.getClient(quote.client_id).subscribe((result:any)=>{
        quote.client_name = result[0].companyName;
      });
      this.service.getClientSite(quote.client_site_id, quote.client_id).subscribe((result:any)=>{
        quote.client_site_name = result[0].name;
      });
      this.service.getPointOfContact(quote.point_of_contact_id, quote.client_id).subscribe((result:any)=>{
        quote.point_of_contact_name = result[0].name;
      });
    } 


  }
  getQuotePage(id: number){
    this.router.navigate(['/quote-page', id]);
  }


}
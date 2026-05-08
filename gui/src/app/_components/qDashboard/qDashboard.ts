//Angular
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

//Models
import { Quote } from '../../_models/quote';

//Services
import { HttpRequestService } from 'src/app/_services/httpRequest.service';
import { AuthService } from 'src/app/_services/auth.service';
import { roles } from 'src/app/auth-config';


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

  constructor(private route: ActivatedRoute, private authService: AuthService, private router: Router, private service: HttpRequestService) { }

  ngOnInit(): void {
    this.setCurrentUserContext();

    if(this.user_role === roles.Sales || this.user_role === roles.Technician){
      this.getUserQuotes(this.user_id);
    }else{
      this.getAll();
    }
  }

  setCurrentUserContext(): void {
    const user = this.authService.getCurrentUser();
    this.user_role = user ? user.role : null;
    this.user_id = user ? user.id : null;
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

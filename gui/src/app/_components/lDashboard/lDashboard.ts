//Angular
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

//Models
import { Lead } from '../../_models/lead';

//Services
import { HttpRequestService } from 'src/app/_services/httpRequest.service';

@Component({
  selector: 'app-lDashboard',
  templateUrl: './lDashboard.html',
  styleUrls: ['./lDashboard.css']
})

//Component that defines how the Lead Table Page will function.
export class LDashboardComponent implements OnInit {

  users: string[] = [];
  leads: Lead[] = [];
  displayedColumns: string[] = ['Lead id','title', 'state', 'description','client','clientsite','poc','dateReceived','dateDue'];
  table: any = [];

  constructor(private route: ActivatedRoute, private router: Router, private service: HttpRequestService) { }

  ngOnInit(): void {
    this.getAll()
  }

  getAll(): void {
    this.service.getLeads()
      .subscribe((leads: Lead[]) => {
        this.leads = leads;
        this.tabulateLeads();
      });
  }

  tabulateLeads(): void {
    for(let lead of this.leads) {
      this.service.getClient(lead.client_id).subscribe((result:any)=>{
        lead.client_name = result[0].companyName;
      });
      this.service.getClientSite(lead.client_site_id, lead.client_id).subscribe((result:any)=>{
        lead.client_site_name = result[0].name;
      });
      this.service.getPointOfContact(lead.point_of_contact_id, lead.client_id).subscribe((result:any)=>{
        lead.point_of_contact_name = result[0].name;
      });
      lead.state_name = this.service.getState(lead.state_id);
    } 
  }

  getLeadPage(id: number){
    this.router.navigate(['/lead-page', id]);
  }


}
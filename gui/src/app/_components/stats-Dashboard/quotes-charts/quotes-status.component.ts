import { Component, OnInit } from '@angular/core';
import { ChartModule } from 'angular2-chartjs';
import { ChartDataResponse, ChartOptions } from '../charts-data.response';
import { HttpRequestService } from '../../../_services/httpRequest.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Quote, Months } from '../../../_models/quote';

@Component({
  selector: 'app-statsquote',
  templateUrl: './quotes-status.component.html',
  styleUrls: ['./quotes-status.component.css']
})
export class QuotesByStatusComponent implements OnInit {
  data!: { labels: string[]; datasets: { label: string; data: number[]; }[]; };
  type!: string;
  options!: { responsive: boolean; maintainAspectRatio: boolean; };
  quotes!: any[];

  constructor(private route: ActivatedRoute, private router: Router, private service: HttpRequestService) {

  }

  getQuotesByMonth(){
    this.type = 'bar';

    let counts:number[] = [0,0,0,0,0,0,0,0,0,0,0,0];

    for(let quote of this.quotes)
    {
      let month = parseInt(quote.dateReceived.substring(5,7));
      console.log(month);
      counts[month-1] += 1
    }
    console.log(counts);
    
    this.data = {
      labels: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
      datasets: [
        {
          label: "Quotes by month",
          data: [counts[0], counts[1], counts[2], counts[3], counts[4], counts[5], counts[6], counts[7], counts[8], counts[9], counts[10], counts[11]]
        }
      ]
    };
    this.options = {
      responsive: true,
      maintainAspectRatio: false
    };

  }

  getQuoteLabelsAndCounts(){
      
  }

  ngOnInit() {
    this.service.getQuotes().subscribe((quotes: Quote[]) => {     
        this.quotes = quotes;
        this.getQuotesByMonth();
    });


  }

}

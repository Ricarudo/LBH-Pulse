import { Component, OnInit } from '@angular/core';
import { ChartModule } from 'angular2-chartjs';
import { ChartDataResponse, ChartOptions } from './charts-data.response';
import { HttpRequestService } from '../../_services/httpRequest.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Quote } from '../../_models/quote';

@Component({
  selector: 'app-stats-dashboard',
  templateUrl: './stats-Dashboard.component.html',
  styleUrls: ['./stats-Dashboard.component.css'],
})
export class StatsDashboardComponent implements OnInit {

  constructor(private route: ActivatedRoute, private router: Router, private service: HttpRequestService) { }

  ngOnInit() {
  }

}

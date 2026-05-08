//ANGULAR
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

//MATERIAL
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatMenuModule } from '@angular/material/menu';

//MODULES
import { AppRoutingModule } from './app.routing';

//COMPONENTS
import { AppComponent } from './app.component';
import { HomeComponent } from './home/home.component';
import { QDashboardComponent } from './_components/qDashboard/qDashboard';
import { LDashboardComponent } from './_components/lDashboard/lDashboard';
import { LeadPageComponent } from './_components/lead-page/lead-page';
import { ClientManagerComponent } from './_components/client-manager/client-manager';
import { QuotePageComponent } from './_components/quote-page/quote-page';
import { QuotesByStatusComponent } from './_components/stats-Dashboard/quotes-charts/quotes-status.component';
import { ChartModule } from 'angular2-chartjs';
import { StatsDashboardComponent } from './_components/stats-Dashboard/stats-Dashboard.component';
import { FileSaverModule } from 'ngx-filesaver';
import { ItemManagerComponent } from './_components/item-manager/item-manager';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    StatsDashboardComponent,
    QuotesByStatusComponent,
    QDashboardComponent,
    QuotePageComponent,
    LDashboardComponent,
    LeadPageComponent,
    ClientManagerComponent,
    ItemManagerComponent
  ],
  imports: [
    ChartModule,
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    FormsModule,
    FileSaverModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatToolbarModule,
    HttpClientModule,
    MatSidenavModule,
    MatListModule,
    MatCardModule,
    MatInputModule,
    MatTableModule,
    MatFormFieldModule,
    MatCheckboxModule,
    MatIconModule,
    MatSelectModule,
    MatDialogModule,
    MatAutocompleteModule,
    MatMenuModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

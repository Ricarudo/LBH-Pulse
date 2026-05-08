import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';
import { HomeComponent } from './home/home.component';

import { QDashboardComponent } from './_components/qDashboard/qDashboard';
import { RoleGuardService } from './_services/role-guard';
import { QuotePageComponent } from './_components/quote-page/quote-page';
import { LeadPageComponent } from './_components/lead-page/lead-page';
import { ClientManagerComponent } from './_components/client-manager/client-manager';

import { roles } from './auth-config';
import { LDashboardComponent } from './_components/lDashboard/lDashboard';
import { QuotesByStatusComponent } from './_components/stats-Dashboard/quotes-charts/quotes-status.component';
import { StatsDashboardComponent } from './_components/stats-Dashboard/stats-Dashboard.component';
/**
 * MSAL Angular can protect routes in your application
 * using MsalGuard. For more info, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-angular/docs/v2-docs/initialization.md#secure-the-routes-in-your-application
 */
const routes: Routes = [
  

  {
    path: 'quote-page/:id',
    component: QuotePageComponent,
    canActivate: [
      MsalGuard,
      RoleGuardService
    ],
    data: { 
      expectedRole: [roles.TaskEstimator, roles.TaskManager]
    } 
  },

  {
    path: 'lead-page/create',
    component: LeadPageComponent,
    canActivate: [
      MsalGuard,
      RoleGuardService
    ],
    data: { 
      expectedRole: [roles.TaskEstimator, roles.TaskManager]
    } 
  },
  {
    path: 'lead-page/:id',
    component: LeadPageComponent,
    canActivate: [
      MsalGuard,
      RoleGuardService
    ],
    data: { 
      expectedRole: [roles.TaskEstimator, roles.TaskManager]
    } 
  },
 

  {
    path: 'qDashboard',
    component: QDashboardComponent,
    canActivate: [
      MsalGuard,
      RoleGuardService,
    ],
    data: { 
      expectedRole: [roles.TaskEstimator, roles.TaskManager]
    } 
  },
  {
    path: 'lDashboard',
    component: LDashboardComponent,
    canActivate: [
      MsalGuard,
      RoleGuardService,
    ],
    data: { 
      expectedRole: [roles.TaskEstimator, roles.TaskManager]
    } 
  },
  {
    path: 'statistics',
    component: StatsDashboardComponent,
    canActivate: [
      MsalGuard,
      RoleGuardService,
    ],
    data: { 
      expectedRole: [roles.TaskEstimator, roles.TaskManager, roles.TaskAdmin]
    }
  },
  {
    // Needed for hash routing
    path: 'state',
    component: HomeComponent
  },
  {
    // Needed for hash routing
    path: 'code',
    component: HomeComponent
  },
  {
    // Needed for hash routing
    path: 'error',
    component: HomeComponent
  },
  {
    path: '',
    component: HomeComponent
  }
];

const isIframe = window !== window.parent && !window.opener;

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
    useHash: true,
    // Don't perform initial navigation in iframes
    initialNavigation: !isIframe ? 'enabled' : 'disabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
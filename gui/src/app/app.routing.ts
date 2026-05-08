import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HomeComponent } from './home/home.component';

import { QDashboardComponent } from './_components/qDashboard/qDashboard';
import { RoleGuardService } from './_services/role-guard';
import { QuotePageComponent } from './_components/quote-page/quote-page';
import { LeadPageComponent } from './_components/lead-page/lead-page';

import { roles } from './auth-config';
import { LDashboardComponent } from './_components/lDashboard/lDashboard';
import { StatsDashboardComponent } from './_components/stats-Dashboard/stats-Dashboard.component';

const workbenchRoles = [
  roles.Admin,
  roles.Sales,
  roles.ProjectManager,
  roles.Technician
];

const routes: Routes = [
  {
    path: 'quote-page/:id',
    component: QuotePageComponent,
    canActivate: [RoleGuardService],
    data: {
      expectedRole: workbenchRoles
    }
  },
  {
    path: 'lead-page/create',
    component: LeadPageComponent,
    canActivate: [RoleGuardService],
    data: {
      expectedRole: workbenchRoles
    }
  },
  {
    path: 'lead-page/:id',
    component: LeadPageComponent,
    canActivate: [RoleGuardService],
    data: {
      expectedRole: workbenchRoles
    }
  },
  {
    path: 'qDashboard',
    component: QDashboardComponent,
    canActivate: [RoleGuardService],
    data: {
      expectedRole: workbenchRoles
    }
  },
  {
    path: 'lDashboard',
    component: LDashboardComponent,
    canActivate: [RoleGuardService],
    data: {
      expectedRole: workbenchRoles
    }
  },
  {
    path: 'statistics',
    component: StatsDashboardComponent,
    canActivate: [RoleGuardService],
    data: {
      expectedRole: [roles.Admin, roles.ProjectManager]
    }
  },
  {
    path: '',
    component: HomeComponent
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      useHash: true,
      initialNavigation: 'enabled'
    })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }

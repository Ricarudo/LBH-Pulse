import { Component, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AuthenticationResult, EventMessage, EventType, InteractionStatus } from '@azure/msal-browser';


//Services
import { HttpRequestService } from 'src/app/_services/httpRequest.service';

import {MatTableModule} from '@angular/material/table';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {

  loginDisplay = false;
  displayedColumns: string[] = ['claim', 'value'];
  dataSource: any =[];

  private readonly _destroying$ = new Subject<void>();

  constructor(private authService: MsalService, private msalBroadcastService: MsalBroadcastService, private service: HttpRequestService) { }

  ngOnInit(): void {
    this.msalBroadcastService.msalSubject$
      .pipe(
        filter((msg: EventMessage) => msg.eventType === EventType.LOGIN_SUCCESS),
        takeUntil(this._destroying$)
      )
      .subscribe((result: EventMessage) => {
        if (result?.payload) {
          const payload: AuthenticationResult = result.payload as AuthenticationResult
          this.authService.instance.setActiveAccount(payload.account);
        }
      });

      this.msalBroadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None)
      )
      .subscribe(() => {
        this.setLoginDisplay();
        this.checkAndSetActiveAccount();
        this.getClaims(this.authService.instance.getActiveAccount()?.idTokenClaims)
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

  setLoginDisplay() {
    this.loginDisplay = this.authService.instance.getAllAccounts().length > 0;
  }

  getClaims(claims: any) {
    this.dataSource = [
      {id: 1, claim: "Display Name", value: claims ? claims['name'] : null},
      {id: 2, claim: "User Principal Name (UPN)", value: claims ? claims['preferred_username'] : null},
      {id: 3, claim: "OID", value: claims ? claims['oid']: null},
      {id: 4, claim: "Roles", value: claims ? claims['roles']: null}
    ];

    this.service.getUser(claims['oid']).subscribe((user: any)=>{
      if(user==""){
        console.log("CREATING USER");
        this.service.createUser({
          user_id: claims['oid'],
          name: claims['name'],
          email: claims['preferred_username']
        }).subscribe((data:any)=>{
          console.log("USER CREATED");
        });
      }
    });
    
    console.log("ESTE ES EL ID: ", claims['oid']);
  }

  ngOnDestroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }
}
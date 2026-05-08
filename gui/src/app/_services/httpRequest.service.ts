import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { apiConfig } from '../auth-config';
import { AuthService } from './auth.service';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

//Models
import { Lead } from '../_models/lead';
import { Client, ClientSite, PointOfContact } from '../_models/client';
import { Quote } from '../_models/quote';
import { User } from '../_models/user';
import { Item } from '../_models/item';
import { Entry, LaborCost } from '../_models/entry';



@Injectable({
    providedIn: 'root'
  })
  export class HttpRequestService {
    clients: Client[];
    client_id: number;
    client_site_id: number;
    point_of_contact_id: number;
    url = apiConfig.endpoint;
    
    //States
    states: { [key: string]: string } = {
        1: "Active",
        2: "Qualified",
        3: "Archived",
        4: "Won",
        5: "Lost",
        6: "Waiting Approval",
        7: "Approved",
        8: "On Revision"
      }; 
     
    httpOptions = {
      headers: new HttpHeaders({
        'Content-Type':  'application/json',
      })
    };
 


    constructor(private http: HttpClient, private authService: AuthService) {
      this.clients = [];
      this.client_id = 0;
      this.client_site_id = 0;
      this.point_of_contact_id = 0;
     }

     //---- STATES
     getState(key:number){
       return this.states[key];
     }

     //---- USERS

    getUsers() { 
      const localUsers = this.authService.getLocalApiUsers();

      return this.http.get<User[]>(this.url + "/users", this.httpOptions)
        .pipe(
          map((users: User[]) => this.mergeUsers(users || [], localUsers)),
          catchError(() => of(localUsers))
        );               
    }

    getUser(user_id: String) { 
      const localUser = this.authService.getLocalUserById(String(user_id));

      if (localUser) {
        return of([{
          user_id: localUser.id,
          name: localUser.name,
          email: localUser.email
        }]);
      }

      return this.http.get<User[]>(this.url + "/users/"+user_id, this.httpOptions);               
    }

    private mergeUsers(users: User[], localUsers: User[]): User[] {
      const mergedUsers = new Map<string, User>();

      localUsers.forEach((user) => mergedUsers.set(user.user_id, user));
      users.forEach((user) => mergedUsers.set(user.user_id, user));

      return Array.from(mergedUsers.values());
    }

    createUser(user: any){
      let body = JSON.stringify(user);
      console.log("Entre aqui a crear user:" + body);
      return this.http.post<any>(this.url + "/users", body, this.httpOptions);
    }
   


    //-----CLIENTS, CLIENTS SITES, POINT OF CONTACTS
    getClients() { 
      return this.http.get<Client[]>(this.url + "/clients", this.httpOptions);               
    }

    
  
    createClient(client: any){
      var client_id;
      let body = JSON.stringify(client)
      console.log("Entre aqui a crear:" + body);
      return this.http.post<any>(this.url + "/clients", body, this.httpOptions);
     
  }
    
    editClient(client:any, client_id:number){
      return this.http.put<Client>(this.url + "/clients/"+  client_id, client);
    }
  
    getClient(id: number) { 
      return this.http.get<Client[]>(this.url + "/clients/" +  id);
    }

    createClientSite(clientSite: any, client_id:number){
      let body = JSON.stringify(clientSite)
      console.log("Entre aqui a crear:" + body);
      return this.http.post<any>(this.url + "/clients/"+client_id+"/client_sites", body, this.httpOptions);
    }
  
    getClientSite(client_site_id:number, client_id: number) { 
      return this.http.get<ClientSite[]>(this.url  + "/clients/"+  client_id + '/client_sites/' +client_site_id);
    }

    getClientSites(client_id: number) { 
      return this.http.get<ClientSite[]>(this.url  + "/clients/"+  client_id + '/client_sites/');
    }

    editClientSite(client_site:any, client_site_id:number, client_id:number){
      return this.http.put<Client>(this.url + "/clients/"+  client_id+"/client_sites/"+client_site_id+"/", client_site);
    }
  
    createPointOfContact(POC: any, client_id: number){
      let body = JSON.stringify(POC)
      console.log("Entre aqui a crear "+ body);
      return this.http.post<PointOfContact[]>(this.url  + "/clients/"+  client_id + "/poc/", body, this.httpOptions);
    }
  
    getPointOfContact(point_of_contact_id: number, client_id: number ) { 
      return this.http.get<PointOfContact[]>(this.url  + "/clients/"+  client_id + '/poc/' +point_of_contact_id);

    }

    getPointOfContacts(client_id: number) { 
      return this.http.get<PointOfContact[]>(this.url  + "/clients/"+  client_id + '/poc/');
    
    }

    editPointOfContact(poc:any, poc_id:number, client_id:number){
      return this.http.put<Client>(this.url + "/clients/"+  client_id+"/poc/"+poc_id+"/", poc);
    }

    //-----LEADS
    
    getLeads() { 
        return this.http.get<Lead[]>(this.url+ "/leads/");
      }
    
      getLead(id: number) { 
        return this.http.get<Lead[]>(this.url + "/leads/"+   id);
      }
    
      editLead(lead: Lead) { 
        return this.http.put<Lead>(this.url + "/leads/"+  lead.lead_id, lead);
      }
      submitLead(lead: any) {
        let body = JSON.stringify(lead);
        console.log("Crear Lead con:" + body);
        this.http.post<any>(this.url+ "/leads", lead).subscribe(
        );
      }

      updateLead(lead:any){
        let body = JSON.stringify(lead);
        console.log("Actualizar Lead con:" + body);
        this.http.put<any>(this.url+ "/leads/"+lead.lead_id, lead).subscribe(
        );
      }
  
    //-----QUOTES

    getQuotes() { 
        return this.http.get<Quote[]>(this.url+ "/quotes");
      }

    getUserQuotes(user_id:any){
      return this.http.get<Quote[]>(this.url+ "/quotes/user/"+user_id);
    }
    
    getQuote(id: number) { 
        return this.http.get<Quote>(this.url+ "/quotes/" +   id);
      }
    
    editQuote(quote: any) { 
        console.log("EDITING WITH");
        console.log(quote);
        return this.http.put<Quote>(this.url + "/quotes/"+   quote.quote_id, quote);
      }
    
    submitQuote(quote: any) {
        let body = JSON.stringify(quote);
        console.log("Crear Quote con:" + body);
        return this.http.post<any>(this.url+ "/quotes", quote);
    }  

    //QUOTE, LABOR, MATERIAL ENTRY


    getQuoteEntries(quote: any){
      return this.http.get<Entry[]>(this.url + "/quotes/" + quote + "/bom");
    } 
    createQuoteEntry(quote: number, form: any){
      let body = JSON.stringify(form);
      console.log("Crear Quote Entry con:" + body);
      return this.http.post<any>(this.url + "/quotes/" + quote + "/bom", form);
    }
    getLaborEntry(quote: any,bom: number){
      return this.http.get<LaborCost>(this.url + "/quotes/" + quote + "/bom/" + bom + "/laborcosts");
    }
    getMaterialEntries(quote: any,bom:number){
      return this.http.get<any[]>(this.url + "/quotes/" + quote + "/bom/" + bom + "/materialcosts");
    }
    
    //ITEMS 
    getItems(){
      return this.http.get<Item[]>(this.url + "/items");
    } 

    getItem(id:number){
      return this.http.get<any>(this.url + "/items/" + id );
    } 
    createItem(form: any){
      let body = JSON.stringify(form);
      console.log("Crear Item with:" + body);
      return this.http.post<any>(this.url + "/items", form);
    }

    editItem(item:any, item_id:number){
      return this.http.put<Item>(this.url + "/items/"+  item_id, item);
    }
  

  }
  
  

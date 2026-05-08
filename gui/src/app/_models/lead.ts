export type Lead = {
    lead_id: number;
    title: String;
    employee: String;
    projectDescription: String;
    client_id: number;
    client_name: String;
    client_site_id: number;
    client_site_name: String;
    point_of_contact_id: number;
    point_of_contact_name: String;
    assigned_employee_id: number;
    assigned_employee_name: String;
    dateReceived: Date;
    dateDue: Date;
    dateCreated: Date;
    state_id: number;
    state_name: string;
    comments: String;
  }

  // export interface Lead {
  //   lead_id: number;
  //   title: String;
  //   employee: String;
  //   projectDescription: String;
  //   client_id: String;
  //   clientSite_id: String;
  //   pointOfContact_id: String;
  //   assignedEmployees_id: number;
  //   dateRecieved: Date;
  //   dateDue: Date;
  //   dateCreated: Date;
  //   state_id: String;
  //   comments: String;
  // }

  export class LeadObj {
      constructor(
        public lead_id: number,
        public title: String,
         //public employee: String,
        public projectDescription: String,
        public client_id: number,
        public clientSite_id: number,
        public pointOfContact_id: number,
        public assignedEmployees_id: number,
        public dateRecieved: Date,
        public dateDue: Date,
        public dateCreated: Date,
        public state_id: number,
        public comments: String,
      )
      {

      }
  }



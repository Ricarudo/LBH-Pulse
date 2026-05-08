import { Item } from "./item"

export type Quote = {
    id: number;
    r2_id: number;
    lead_id: number;
    title: String;
    projectDescription: String;
    client_id: number;
    client_name: String;
    client_site_id: number;
    client_site_name: String;
    point_of_contact_id: number;
    point_of_contact_name: String;
    current_employee_id: number;
    attachements: File;
    dateCreated: String;
    dateReceived: String;
    dueDate: String;
    state_id: number;
    state_name: String;
    comments: String;
    eventRegister: String;
    proposalSpecifications: String
   
}

export enum States {
  Active = 1,
  Qualified,
  Archived,
  Won,
  Lost,
  WaitingApproval,
  Approved,
  OnRevision,
};

export enum Months {
  January = 1,
  February,
  March,
  April,
  May,
  June,
  July,
  August,
  September,
  October,
  November,
  December,
};

export interface BillOfMaterials {
    item: Item;
    quantity: number;
}

export interface assignedEmployee {
  User: String;
  dateAssigned: String;
}
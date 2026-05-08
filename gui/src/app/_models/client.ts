
export type Client ={
    client_id: number;
    companyName: string;
    comment: string;
}

export type ClientSite={
    client_site_id: number;
    name: string;
    client_id: number;
    address: string;
    comments: string;

}

export type PointOfContact={
    point_of_contact_id: number;
    client_id: number;
    name: String;
    email: String;
    phone: string;
    job_title: string;
    comments: string;
}
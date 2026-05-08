import { PDFDocument } from 'pdf-lib';
import { FileSaverService } from 'ngx-filesaver'; 
// var companyLogo = require('../../assets/resources/R2_Logo_con_icon.png');
// import companyLogo from '../../assets/resources/logo.png'

let json = {
    // "fields" : {
        "title" : "Some Title Here",
         "dateReceived" : "20/11/2021",
         "dueDate" : "27/11/2021",
         "client" : "R2 Comms",
         "client_site" : "Toa Alta",
         "point_of_contact" : "Ricardo",
         "projectDescription" : "Alejandro Rodriguez",
         "comments" : "Something about the project"
 
    // }
 };

export async function createForm(json: any){
    const doc = await PDFDocument.create();
    // const logo = await doc.embedPng(companyLogo);
    // const logo_dims = logo.scale(0.5);

    const page = doc.addPage();

    // page.drawImage(logo, {
    //     x : page.getWidth() / 2 - logo_dims.width/2,
    //     y: page.getHeight() / 2 - logo_dims.height/2 + 250,
    //     width: logo_dims.width,
    //     height: logo_dims.height,
    // })
    const page_padding = 10

    ///header
    const form = doc.getForm();
    // for(let [field, value] of Object.entries(json))
    // {
        // console.log(`Field: ${field} Value: ${value}`)
    const title = form.createTextField("Title");
    title.setText(json["title"]);

    title.addToPage(page, {
                        // x: page.getWidth()- Math.floor((0.95) * (page.getWidth())),
                        width: 50,
                        height: 40,
                        x: page.getWidth() / 2   - 20,
                        y: (page.getHeight() - 10* page_padding) -  20 , 
    })

    page.drawText("Received", {
            x: page_padding,
            y: (page.getHeight() - 10* page_padding) -  60, 
            size: 15,
    });

    const received = form.createTextField("Date Received");
    received.setText(json["dateReceived"]);

    received.addToPage(page, {
                        width: 50,
                        height: 15,
                        x: 100,
                        y: (page.getHeight() - 10* page_padding) -  60, 
    })

    page.drawText("Client", {
        x: page_padding,
        y: (page.getHeight() - 10* page_padding) -  100, 
        size: 20,
    });

    const client = form.createTextField("Client");
    client.setText(json["client"]);

    client.addToPage(page, {
                        width: 100,
                        height: 20,
                        x:  100,
                        y: (page.getHeight() - 10* page_padding) -  100, 
    })

    page.drawText("Client Site", {
        x: page_padding,
        y: (page.getHeight() - 10* page_padding) -  140, 
        size: 20,
    });

    const clientsite = form.createTextField("Client Site");
    clientsite.setText(json["client_site"]);

    clientsite.addToPage(page, {
                        width: 50,
                        height: 30,
                        x: 125,
                        y: (page.getHeight() - 10* page_padding) -  140, 
    })

    page.drawText("Point of Contact", {
        x: page.getWidth() - (page_padding + 50) - 150,
        y: (page.getHeight() - 10* page_padding) -  80, 
        size: 20,
    });

    const point_of_contact = form.createTextField("Point of Contact");
    point_of_contact.setText(json["point_of_contact"]);

    point_of_contact.addToPage(page, {
                                width: 50,
                                height: 30,
                                x: page.getWidth() - (page_padding + 50),
                                y: (page.getHeight() - 10* page_padding) -  80, 
    });

    page.drawText("Assigned To", {
        x: page.getWidth() - (page_padding + 50) - 125,
        y: (page.getHeight() - 10* page_padding) -  120, 
        size: 20,
    });

    const employee = form.createTextField("Assigned Employee");
    employee.setText(json["assigned_employee"]);

    employee.addToPage(page, {
                                width: 50,
                                height: 30,
                                x: page.getWidth() - (page_padding + 50),
                                y: (page.getHeight() - 10* page_padding) -  120, 
    });

    page.drawText("Project Description", {
        x: page.getWidth() / 2 - (page_padding + 50),
        y: Math.floor((0.60) * page.getHeight()) + (page_padding + 70),
        size: 20,
    });

    const desc = form.createTextField("Project Description");
    desc.setText(json["projectDescription"]);
    desc.addToPage(page, {
        x: page.getWidth() / 2 - (page_padding + 50),
        y: Math.floor((0.60) * page.getHeight()) + (page_padding + 10),
    })


    page.drawText("Comments", {
        x: page.getWidth() / 2 - (page_padding + 50),
        y: Math.floor((0.25) * page.getHeight()) + (page_padding + 70),
        size: 20,
    });
    const comms = form.createTextField("Comments");
    desc.setText(json["comments"]);
    desc.addToPage(page, {
        x: page.getWidth() / 2 - (page_padding + 50),
        y: Math.floor((0.25) * page.getHeight()) + (page_padding + 10),
    })
    
    const bytes = await doc.save();
    const file = new Blob([bytes], {type: "text/plain;charset=utf-8"})

    new FileSaverService().save(file, `${new Date()}.pdf`);

}


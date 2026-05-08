/** REST Enpoint for interacting with Clients in the DB */
var express = require('express');
const { route } = require('./leads');
const { check, exists, not,notEmpty, isEmpty, trim, escape, isDate, isEmail, normalizeEmail, validationResult } = require('express-validator');
var router = express.Router();



var DataBaseHandler = require("../config/DataBaseHandler");
var dataBaseHandler = new DataBaseHandler();

var connection = dataBaseHandler.createConnection();


const client_table = `Client`;
const poc_table = `PointOfContact`;
const client_sites_table = `ClientSite`;


router.route('/')
     .get((req, res) => {
       var results = [];
        connection.query(
          `SELECT * FROM ${client_table};`, function (err, rows) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
              rows.forEach((element) => {
                results.push(
                    {
                        "client_id": element.client_id,
                        "companyName": element.companyName,
                        "comments": element.comments
                    });
            });
            console.log("[ENDPOINT] GET All Clients:", results);
            res.json(results);
        });
     })
     .post([
             check('comments').exists().trim().escape(),
             check('companyName').exists().notEmpty().trim().escape()],(req , res) => {
        
        const errors = validationResult(req);
        if (!errors.isEmpty())
        {
          res.status(400).json({ errors: errors.array() })
          return ;      
        }
        
        var client = req.body;
        connection.query(
        `INSERT INTO ${client_table} (companyName, comments)\
        VALUES (?, ?)`,
        [client.companyName, client.comments], function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }
          console.log("Last client inserted id = "+result.insertId);
          res.json({"result":"completed", "client_id":result.insertId});
        });
        connection.commit();
      });
      

router.route('/:id')
      .get((req, res) => {
        var results = [];
        connection.query(
          `SELECT * FROM ${client_table} WHERE client_id=${req.params.id};`, function (err, rows) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
              rows.forEach((element) => {
                results.push(
                    {
                        "client_id": element.client_id,
                        "companyName": element.companyName,
                        "comments": element.comments
                    });
            });
            if(results.length == 0){
              res.status(400).json({errors: "No Client with id found"});
              return;
            }
            console.log("[ENDPOINT] GET Client with id:", results);
            res.json(results);
        });
      })
      .put([ check('comments').exists().trim().escape(),
             check('companyName').exists().notEmpty().trim().escape()],
            (req , res) => {
            
            const errors = validationResult(req);
            if (!errors.isEmpty())
              return res.status(400).json({ errors: errors.array() });    

            var client = req.body;
            connection.query(
            `UPDATE ${client_table} SET ? WHERE client_id=${req.params.id};`,[client],
            function(err, result, fields) {
              if (err){
                console.log(err);
                res.status(400).json({ errors: err})
                return;
              }
              console.log("Update client with id "+req.params.id);
              res.json({"result":"completed", "client_id":req.params.id});
            });
            connection.commit();
      })
      .delete((req , res) => {
        connection.query(
        `DELETE FROM ${client_table} WHERE client_id = '${req.params.id}';`,
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }

          if(result.affectedRows == 0){
            console.log(result);
            res.status(400).json({errors: "No Client with id found"});
            return;
          }
          console.log("Client deleted with id: "+req.params.id);
          res.json({"result":"completed", "client_id":req.params.id});
        });
        connection.commit();
      });

router.route('/:id/client_sites')
      .get((req , res) => {
        var results = [];
        connection.query(
          `SELECT * FROM ${client_sites_table} WHERE client_id = ${req.params.id};`,
           function (err, rows) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
              rows.forEach((element) => {
                results.push(
                    {
                        "client_site_id": element.client_site_id,
                        "client_id": element.client_id,
                        "name": element.name,
                        "address": element.address,
                        "comments": element.comments
                    });
            });
            console.log("[ENDPOINT] GET All ClientSites:", results);
            res.json(results);
        });
      })
      .post([
              check('name').exists().notEmpty().trim().escape(),
              check('comments').exists().trim().escape(),
              check('address').exists().notEmpty().trim().escape()],
      
      (req , res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty())
          return res.status(400).json({ errors: errors.array() });    
        
        var client_site = req.body;
        connection.query(
        `INSERT INTO ${client_sites_table} (client_id, name, address, comments)\
        VALUES (?, ?, ?, ?)`,
        [req.params.id, client_site.name, client_site.address, client_site.comments], function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }
          console.log("Last client_site inserted id = "+result.insertId);
          res.json({"result":"completed", "client_site_id":result.insertId});
        });
        connection.commit();
      });


      router.route('/:id/client_sites/:client_site_id')
      .get((req , res) => {
        connection.query(
          `SELECT * FROM ${client_sites_table} WHERE client_site_id = ${req.params.client_site_id};`, 
          function (err, result) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
                  console.log("[ENDPOINT] GET specific client site:", result);
                  res.json(result);
            });  
      })
      .put([
              check('name').exists().trim().notEmpty().escape(),
              check('comments').exists().trim().escape(),
              check('address').exists().trim().notEmpty().escape()],
      (req , res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty())
          return res.status(400).json({ errors: errors.array() }); 

        var  client_site = req.body;
        connection.query(
        `UPDATE ${client_sites_table} SET client_id = '${client_site.client_id}', name = '${client_site.name}', \
         address = '${client_site.address}', comments = '${client_site.comments}'\
         WHERE client_site_id = '${req.params.client_site_id}';`,
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }
          console.log("Update client site with id "+req.params.client_site_id);
          res.json({"result":"completed", "client_site_id":req.params.client_site_id});
        });
        connection.commit();
      })
      .delete((req , res) => {
        var client_site = req.body;
        connection.query(
        `DELETE FROM ${client_sites_table} WHERE client_site_id = '${req.params.client_site_id}';`,
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }
          console.log("Client site deleted with id "+req.params.client_site_id);
          res.json({"result":"completed", "client_site_id":req.params.client_site_id});
        });
        connection.commit();
      });

router.route('/:id/poc')
      .get((req , res) => {
        var results = [];
        connection.query(
          `SELECT * FROM ${poc_table} WHERE client_id = ${req.params.id};`, function (err, rows) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
            rows.forEach((element) => {
              results.push(
                  {
                      "point_of_contact_id": element.point_of_contact_id,
                      "client_id": element.client_id,
                      "name": element.name,
                      "email": element.email,
                      "phone": element.phone,
                      "job_title": element.job_title,
                      "comments": element.comments
                  });
          });
          console.log("[ENDPOINT] GET All PointOfContacts:", results);
          res.json(results);
        });
      })
      .post([ check('phone').exists().trim().escape(),
              check('name').exists().notEmpty().trim().escape(),
              check('email').exists().notEmpty().escape(),
              check('comments').exists().trim().escape(),
              ],
      
      (req , res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty())
          return res.status(400).json({ errors: errors.array() }); 

        var point_of_contact = req.body;
        connection.query(
        `INSERT INTO ${poc_table} (client_id, name, email, phone, job_title, comments)\
        VALUES (?, ?, ?, ?, ?, ?)`,
        [req.params.id, point_of_contact.name, point_of_contact.email, point_of_contact.phone,
        point_of_contact.job_title,point_of_contact.comments], function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }
          console.log("Last point_of_contact inserted id: "+result.insertId);
          res.json({"result":"completed", "poc_id":result.insertId});
        });
        connection.commit();
      });

      router.route('/:id/poc/:poc_id/')
      .get((req , res) => {
        connection.query(
          `SELECT * FROM ${poc_table} WHERE point_of_contact_id = ${req.params.poc_id};`, 
          function (err, result) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
                  console.log("[ENDPOINT] GET specific poc:", result);
                  res.json(result);
            });  
            
      })
      .put([  check('client_id').exists().trim().escape(),
              check('name').exists().trim().notEmpty().escape(),
              check('email').exists().trim().notEmpty().escape(),
              check('comments').exists().trim().escape(),
              check('job_title').exists().trim().escape()],
        (req , res) => {
        
          const errors = validationResult(req);
          if (!errors.isEmpty())
            return res.status(400).json({ errors: errors.array() });

          var  poc = req.body;
          connection.query(
          `UPDATE ${poc_table} SET client_id = '${poc.client_id}', name = '${poc.name}', \
          email = '${poc.email}', phone = '${poc.phone}', job_title = '${poc.job_title}', comments = '${poc.comments}'
          WHERE point_of_contact_id = '${req.params.poc_id}';`,
          function(err, result, fields) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
            console.log("Update poc with id "+req.params.poc_id);
            res.json({"result":"completed", "point_of_contact_id":req.params.poc_id});
          });
          connection.commit();
      })
      .delete((req , res) => {
        var poc = req.body;
        connection.query(
        `DELETE FROM ${poc_table} WHERE point_of_contact_id = '${req.params.poc_id}';`,
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }
          console.log("POC deleted with id "+req.params.poc_id);
          res.json({"result":"completed", "point_of_contact_id":req.params.poc_id});
        });
        connection.commit();
      });


module.exports = router;
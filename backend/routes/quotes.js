/** REST Enpoint for interacting with Quotes in the DB */
const e = require('cors');
var express = require('express');
var router = express.Router();
const { check, exists, not, notEmpty, isEmpty, trim, escape, isDate, isEmail, normalizeEmail, validationResult } = require('express-validator');


var DataBaseHandler = require("../config/DataBaseHandler");
var dataBaseHandler = new DataBaseHandler();

var connection = dataBaseHandler.createConnection();

const quote_table = `Quote`;
const bom_table = `BillOfMaterials_Entry`;
const laborcost_table = `LaborCost`;
const materialcost_table = `MaterialCost`;

/*Get all quotes
  Post new quote*/
router.route('/')
      .get((req, res) => {
        var results = [];
        connection.query(
          `SELECT * FROM ${quote_table};`, function (err, rows) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
              rows.forEach((element) => {
                results.push(
                    {
                        "quote_id" : element.quote_id,
                        "r2_id" : element.r2_id,
                        "lead_id" : element.quote_id,
                        "state_id": element.state_id,
                        "client_id" : element.client_id,
                        "client_site_id": element.client_site_id,
                        "point_of_contact_id": element.point_of_contact_id,
                        "dueDate": element.dueDate,
                        "dateReceived" : element.dateReceived,
                        "dateCreated" : element.dateCreated,
                        "title": element.title,
                        "projectDescription" :element.projectDescription,
                        "comments": element.comments,
                        "current_employee_id" : element.current_employee_id ,
                        "proposalSpecifications": element.projectSpecifications
                    });
            });
            console.log("[ENDPOINT] GET All Quotes:", results);
            res.json(results);
          });
      })
      .post([ check("r2_id").exists().notEmpty(),
              check("lead_id").exists().notEmpty(),
              check("state_id").exists().notEmpty(),
              check("client_id").exists().notEmpty(),
              check("client_site_id").exists().notEmpty(),
              check("point_of_contact_id").exists(),
              check("dueDate").exists().notEmpty(),
              check("dateReceived").exists().notEmpty(), 
              check("dateCreated").exists().notEmpty(),
              check("title").exists().notEmpty(),
              check("projectDescription").exists(),
              check("comments").exists(),
              check("current_employee_id").exists().notEmpty(),
              check("proposalSpecifications").exists().notEmpty()],
        
        (req , res) => {

          const errors = validationResult(req);
          if (!errors.isEmpty())
          {
            console.log(errors);
            return res.status(400).json({ errors: errors.array() });
          }
        var quote = req.body;
        connection.query(
        `INSERT INTO ${quote_table} (r2_id, lead_id, state_id, client_id, client_site_id, point_of_contact_id, dueDate,\
        dateReceived, dateCreated, title, projectDescription, comments, current_employee_id, \
        proposalSpecifications)\
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [quote.r2_id, quote.lead_id, quote.state_id, quote.client_id,  quote.client_site_id, quote.point_of_contact_id, quote.dueDate,
         quote.dateReceived, quote.dateCreated, quote.title, quote.projectDescription, quote.comments, quote.current_employee_id, 
         quote.proposalSpecifications], 
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err });
            return
          }
          console.log("Last quote inserted id = "+result.insertId);
          res.json({"result":"completed", "quote_id":result.insertId});
        });
        connection.commit();
      });


/*Get all quotes from user
  Post new quote from user*/
  router.route('/user/:user_id')
  .get((req, res) => {
    var results = [];
    connection.query(
      `SELECT * FROM ${quote_table} WHERE current_employee_id="${req.params.user_id}";`, function (err, rows) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err});
            return;
          }
              
          rows.forEach((element) => {
            results.push(
                {
                    "quote_id" : element.quote_id,
                    "r2_id" : element.r2_id,
                    "lead_id" : element.quote_id,
                    "state_id": element.state_id,
                    "client_id" : element.client_id,
                    "client_site_id": element.client_site_id,
                    "point_of_contact_id": element.point_of_contact_id,
                    "dueDate": element.dueDate,
                    "dateReceived" : element.dateReceived,
                    "dateCreated" : element.dateCreated,
                    "title": element.title,
                    "projectDescription" :element.projectDescription,
                    "comments": element.comments,
                    "current_employee_id" : element.current_employee_id ,
                    "proposalSpecifications": element.projectSpecifications
                });
        });

        

        console.log("[ENDPOINT] GET All Quotes FROM User:", results);
        res.json(results);
      });
  })
  .post([ check("r2_id").exists(),
          check("lead_id").exists().notEmpty(),
          check("state_id").exists().notEmpty(),
          check("client_id").exists().notEmpty(),
          check("client_site_id").exists().notEmpty(),
          check("point_of_contact_id").exists().notEmpty(),
          check("dueDate").exists().notEmpty(),
          check("dateReceived").exists().notEmpty(), 
          check("dateCreated").exists().notEmpty(),
          check("title").exists().notEmpty(),
          check("projectDescription").exists(),
          check("comments").exists()],
    (req , res) => {

      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

        var quote = req.body;
        connection.query(
        `INSERT INTO ${quote_table} (r2_id, lead_id, state_id, client_id, client_site_id, point_of_contact_id, dueDate,\
        dateCreated, dateReceived, title, projectDescription, comments, current_employee_id, \
        proposalSpecifications)\
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [quote.r2_id, quote.lead_id, quote.state_id, quote.client_id,  quote.client_site_id, quote.point_of_contact_id, quote.dueDate,
        quote.dateCreated, quote.dateReceived, quote.title, quote.projectDescription, quote.comments, req.params.user_id, 
        quote.proposalSpecifications], 
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err});
            return;
          }

          console.log("Last quote inserted id:"+result.insertId);
          res.json({"result":"completed", "quote_id":result.insertId});
        });
        connection.commit();
  });

/*Get specific quote
  Update or delete specific quote*/
router.route('/:quote_id')
      .get((req , res) => {
        var results = [];
        connection.query(
          `SELECT * FROM ${quote_table} WHERE quote_id=${req.params.quote_id}`, function (err, rows) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
              rows.forEach((element) => {
                results.push(
                    {
                        "quote_id" : element.quote_id,
                        "r2_id" : element.r2_id,
                        "state_id": element.state_id,
                        "lead_id" : element.quote_id,
                        "client_id" : element.client_id,
                        "client_site_id": element.client_site_id,
                        "point_of_contact_id": element.point_of_contact_id,
                        "dueDate": element.dueDate,
                        "dateReceived" : element.dateReceived,
                        "dateCreated" : element.dateCreated,
                        "title": element.title,
                        "projectDescription" :element.projectDescription,
                        "comments": element.comments,
                        "current_employee_id" : element.current_employee_id ,
                        "bill_of_materials_id": element.bill_of_materials_id,
                        "proposalSpecifications": element.projectSpecifications
                    });
            });
            if(results.length == 0){
              console.log(results);
              res.status(400).json({errors: "No Quote with id found"});
              return;
            }
            console.log(`[ENDPOINT] GET All Quotes with id:${req.params.quote_id}`, results);
            res.json(results);
          });
      })
      .put([ check("r2_id").exists().notEmpty(),
            check("lead_id").exists().notEmpty(),
            check("state_id").exists().notEmpty(),
            check("client_id").exists().notEmpty(),
            check("client_site_id").exists().notEmpty(),
            check("point_of_contact_id").exists().notEmpty(),
            check("dueDate").exists().notEmpty(),
            check("dateReceived").exists().notEmpty(), 
            check("dateCreated").exists().notEmpty(),
            check("title").exists().notEmpty(),
            check("projectDescription").exists(),
            check("comments").exists(),
            check("current_employee_id").exists().notEmpty(),
            check("proposalSpecifications").exists()],
      (req , res) => {

        const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

        var quote = req.body;
        connection.query(
        `UPDATE ${quote_table} SET r2_id = '${quote.r2_id}', lead_id = '${quote.lead_id}', state_id = '${quote.state_id}', client_id = '${quote.client_id}', \
        client_site_id = '${quote.client_site_id}', point_of_contact_id = '${quote.point_of_contact_id}', dueDate = '${quote.dueDate}',\
        dateReceived = '${quote.dateReceived}', dateCreated = '${quote.dateCreated}', title = '${quote.title}', projectDescription = '${quote.projectDescription}',\
        comments = '${quote.comments}', current_employee_id = '${quote.current_employee_id}', \
        proposalSpecifications = '${quote.proposalSpecifications}'
        WHERE quote_id = '${req.params.quote_id}';`,
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }

          if(result.affectedRows == 0){
            console.log(result);
            res.status(400).json({errors: "No Quote with id found"});
            return;
          }

          console.log("Update quote with id "+req.params.quote_id);
          res.json({"result":"completed", "quote_id":req.params.quote_id});
        });
        connection.commit();
      })
      .delete((req , res) => {
        var quote = req.body;
        connection.query(
        `DELETE FROM ${quote_table} WHERE quote_id = '${req.params.quote_id}';`,
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }

          if(result.affectedRows == 0){
            console.log(result);
            res.status(400).json({errors: "No Quote with id found"});
            return;
          }

          console.log("Quote deleted with id "+req.params.quote_id);
          res.json({"result":"completed", "quote_id":req.params.quote_id});
        });
        connection.commit();
      });


/*Get specific quote from user
  Update or delete specific quote from user*/
  router.route('/user/:user_id/:quote_id')
  .get((req , res) => {
    connection.query(
      `SELECT * FROM ${quote_table} WHERE quote_id = '${req.params.quote_id}' AND current_employee_id = '${req.params.user_id}';`, 
      function (err, result) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }
              console.log("[ENDPOINT] GET Specific Quote:", result);
              res.json(result);
        });  
  })
  .put([  check("r2_id").exists().notEmpty(),
          check("lead_id").exists().notEmpty(),
          check("state_id").exists().notEmpty(),
          check("client_id").exists().notEmpty(),
          check("client_site_id").exists().notEmpty(),
          check("point_of_contact_id").exists().notEmpty(),
          check("dueDate").exists().notEmpty(),
          check("dateReceived").exists().notEmpty(), 
          check("dateCreated").exists().notEmpty(),
          check("title").exists().notEmpty(),
          check("projectDescription").exists(),
          check("comments").exists(),
          check("proposalSpecifications").exists().notEmpty()],(req , res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    var quote = req.body;
    connection.query(
    `UPDATE ${quote_table} SET r2_id = '${quote.r2_id}', lead_id = '${quote.lead_id}', state_id = '${quote.state_id}', client_id = '${quote.client_id}', \
    client_site_id = '${quote.client_site_id}', point_of_contact_id = '${quote.point_of_contact_id}', dueDate = '${quote.dueDate}',\
    dateCreated = '${quote.dateCreated}', dateReceived = '${quote.dateReceived}', title = '${quote.title}', projectDescription = '${quote.projectDescription}',\
    comments = '${quote.comments}', current_employee_id = '${quote.current_employee_id}', \
    proposalSpecifications = '${quote.proposalSpecifications}'
    WHERE quote_id = '${req.params.quote_id}' AND current_employee_id = '${req.params.user_id}';`,
    function(err, result, fields) {
      if (err){
        console.log(err);
        res.status(400).json({ errors: err})
        return;
      }

      if(result.affectedRows == 0){
        console.log(result);
        res.status(400).json({errors: "No Quote with id found"});
        return;
      }

      console.log("Update quote with id "+req.params.quote_id);
      res.json({"result":"completed", "quote_id":req.params.quote_id});
    });
    connection.commit();
  })
  .delete((req , res) => {
    var quote = req.body;
    connection.query(
    `DELETE FROM ${quote_table} WHERE quote_id = '${req.params.quote_id}' AND current_employee_id = '${req.params.user_id}';`,
    function(err, result, fields) {
      if (err){
        console.log(err);
        res.status(400).json({ errors: err})
        return;
      }

      if(result.affectedRows == 0){
        console.log(result);
        res.status(400).json({errors: "No Quote with id found"});
        return;
      }

      console.log("Quote deleted with id "+req.params.quote_id);
      res.json({"result":"completed", "quote_id":req.params.quote_id});
    });
    connection.commit();
  });

  /* Get all bom entries of specific quote
     Post new bom entry to specific quote */   
  router.route('/:quote_id/bom')
  .get((req, res) => {
    var results = [];
    connection.query(
      `SELECT * FROM ${bom_table} WHERE quote_id = ${req.params.quote_id};`, function (err, rows) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }
          rows.forEach((element) => {
            results.push(
                {
                    "bill_of_materials_entry_id" : element.bill_of_materials_entry_id,
                    "quote_id" : element.quote_id,
                    "item_id" : element.item_id,
                    "quantity": element.quantity,
                    "workers": element.workers,
                    "unitHours": element.unitHours,
                    "rate": element.rate,
                    "materialCost": element.materialCost,
                    "contingencyPercent": element.contingencyPercent,
                    "freightPercent": element.freightPercent,
                    "profitMarkup": element.profitMarkup,
                    "supplier": element.supplier       
                });
        });
        console.log("[ENDPOINT] GET All BOM entries from quote:", results);
        res.json(results);
      });
  })
  .post([ //check("quote_id").exists().notEmpty(),//TODO: Bug here, remove check for quoteid as thats in the URL route
          check("item_id").exists(),
          check("quantity").exists(),
          check("workers").exists(),
          check("unitHours").exists(),
          check("rate").exists(),
          check("materialCost").exists(),
          check("contingencyPercent").exists(),
          check("freightPercent").exists(),
          check("profitMarkup").exists(),
          check("supplier").exists()],

  (req , res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    var bom_entry = req.body;
    connection.query(
    `INSERT INTO ${bom_table} (quote_id, item_id, quantity, workers, unitHours, rate, \
    materialCost, contingencyPercent, freightPercent, profitMarkup, supplier) \
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [bom_entry.quote_id, bom_entry.item_id, bom_entry.quantity, bom_entry.workers, bom_entry.unitHours, bom_entry.rate, 
      bom_entry.materialCost, bom_entry.contingencyPercent, bom_entry.freightPercent, bom_entry.profitMarkup, bom_entry.supplier], 
    function(err, result, fields) {
      if (err){
        console.log(err);
        res.status(400).json({ errors: err})
        return;
      }

      if(result.affectedRows == 0){
        console.log(result);
        res.status(400).json({errors: "No Quote with id found"});
        return;
      }

      console.log("Last bom entry inserted id:"+result.insertId);
      res.json({"result":"completed", "bill_of_materials_entry_id":result.insertId});
    });
    connection.commit();
  });


     /* Get specific entry of specific quote
        Update or delete specific entry of specific quote */
     router.route('/:quote_id/bom/:entry_id')
     .get((req , res) => {
       connection.query(
         `SELECT * FROM ${bom_table} WHERE bill_of_materials_entry_id = ${req.params.entry_id} AND quote_id = ${req.params.quote_id} ;`, 
         function (err, result) {
          if (err){
            console.log(err);
            res.status(400).json({ errors: err})
            return;
          }
                 console.log("[ENDPOINT] GET specific bom entry from specific quote:", result);
                 res.json(result);
           });  
     })
     .put([ check("item_id").exists().notEmpty(),
            check("quantity").exists().notEmpty(),
            check("workers").exists(),
            check("unitHours").exists(),
            check("rate").exists(),
            check("materialCost").exists(),
            check("contingencyPercent").exists(),
            check("freightPercent").exists(),
            check("profitMarkup").exists(),
            check("supplier").exists()],
      (req , res) => {

        const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

       var entry = req.body;
       connection.query(
       `UPDATE ${bom_table} SET item_id = '${entry.item_id}', quantity = '${entry.quantity}', workers = '${entry.workers}', \
       unitHours = '${entry.unitHours}', rate  = '${entry.rate}', materialCost  = '${entry.materialCost}', contingencyPercent = '${entry.contingencyPercent}',\
       freightPercent = '${entry.freightPercent}', profitMarkup = '${entry.profitMarkup}', supplier = '${entry.supplier}', \
       WHERE bill_of_materials_entry_id = '${req.params.entry_id}';`,
       function(err, result, fields) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }
         console.log("Update bom entry with id "+req.params.entry_id);
         res.json({"result":"completed", "entry_id":req.params.entry_id});
       });
       connection.commit();
     })
     .delete((req , res) => {
       var quote = req.body;
       connection.query(
       `DELETE FROM ${bom_table} WHERE bill_of_materials_entry_id = '${req.params.entry_id}';`,
       function(err, result, fields) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }
         console.log("BOM entry deleted with id "+req.params.entry_id);
         res.json({"result":"completed", "entry_id":req.params.entry_id});
       });
       connection.commit();
     });


module.exports = router;

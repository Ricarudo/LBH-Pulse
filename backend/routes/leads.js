/** REST Enpoint for interacting with Leads in the DB */
var express = require('express');
const { check, exists, not, notEmpty, isEmpty, trim, escape, isDate, isEmail, normalizeEmail, validationResult } = require('express-validator');
var router = express.Router();

const e = require('express');

var DataBaseHandler = require("../config/DataBaseHandler");
var dataBaseHandler = new DataBaseHandler();

var connection = dataBaseHandler.createConnection();

const table = "`Lead`";

router.route('/')
      .get((req, res) => {
        var results = [];
        connection.query(
          `SELECT * FROM ${table};`, function (err, rows) {
            if (err){
              console.log(err);
              res.status(400).json({ errors: err})
              return;
            }
              rows.forEach((element) => {
                results.push(
                    {
                        "lead_id" : element.lead_id,
                        "state_id": element.state_id,
                        "client_id" : element.client_id,
                        "client_site_id": element.client_site_id,
                        "point_of_contact_id": element.point_of_contact_id,
                        "assigned_employee_id": element.assigned_employee_id,
                        "title": element.title,
                        "dueDate": element.dueDate,
                        "dateReceived" : element.dateReceived,
                        "dateCreated" : element.dateCreated,
                        "projectDescription" :element.projectDescription,
                        "comments": element.comments
                    });
            });
            console.log("[ENDPOINT] GET All Leads:", results);
            res.json(results);
          });
      })
      .post([ check('title').exists().not().isEmpty().trim().escape(),
              check('dueDate').exists().not().isEmpty().trim().escape(),
              check('dateReceived').exists().not().isEmpty().trim().escape(),
              check('client_id').exists().not().isEmpty().trim().escape(),
              check('client_site_id').exists().not().isEmpty().trim().escape(),
              // check('assigned_employee_id').exists().not().isEmpty().trim().escape(),
              check('point_of_contact_id').exists().not().isEmpty().trim().escape(),
              check('comments').exists().trim().escape(),
              check('projectDescription').exists().trim().escape()],
        (req , res) => {

            const errors = validationResult(req);
            if (!errors.isEmpty())
            {
              console.log(errors);
              return res.status(400).json({ errors: errors.array() });
            }
            var lead = req.body;
            connection.query(
            `INSERT INTO ${table} (state_id, client_id, client_site_id, point_of_contact_id,\
            assigned_employee_id, title, dueDate, dateReceived, dateCreated, projectDescription, comments)\
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [lead.state_id, lead.client_id, lead.client_site_id, lead.point_of_contact_id, lead.assigned_employee_id, lead.title, 
            lead.dueDate, lead.dateReceived, lead.dateCreated, lead.projectDescription, lead.comments], 
            function(err, result, fields) {
              if (err){
                console.log(err);
                res.status(400).json({ errors: err})
                return;
              }
              console.log("Last lead inserted id: "+result.insertId);
              res.json({"result":"completed", "lead_id":result.insertId});
            });
          
            connection.commit();
      });
        
      
router.route('/:id')
  .get((req , res) => {
    connection.query(
      `SELECT * FROM ${table} WHERE lead_id = ${req.params.id};`, function (err, result) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }
          if(result.affectedRows == 0){
            console.log(result);
            res.status(400).json({errors: "No Lead with id found"});
            return;
          }
              console.log("[ENDPOINT] GET Specific Lead:", result);
              res.json(result);
        });  
  })
  .put([  check('title').exists().not().isEmpty().trim().escape(),
          check('dueDate').exists().not().isEmpty().trim().escape(),
          check('dateReceived').exists().not().isEmpty().trim().escape(),
          check('client_id').exists().not().isEmpty().trim().escape(),
          check('client_site_id').exists().not().isEmpty().trim().escape(),
          // check('assigned_employee_id').exists().not().isEmpty().trim().escape(),
          check('point_of_contact_id').exists().not().isEmpty().trim().escape(),
          check('comments').exists().trim().escape(),
          check('projectDescription').exists().trim().escape()],
  (req , res) => {

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      var lead = req.body;
      connection.query(
      `UPDATE ${table} SET state_id = '${lead.state_id}', client_id = '${lead.client_id}', client_site_id = '${lead.client_site_id}',\
      point_of_contact_id = '${lead.point_of_contact_id}', assigned_employee_id = '${lead.assigned_employee_id}', title = '${lead.title}',\
      dueDate = '${lead.dueDate}', dateReceived = '${lead.dateReceived}', dateCreated = '${lead.dateCreated}', \
      projectDescription = '${lead.projectDescription}', comments = '${lead.comments}' WHERE lead_id = '${req.params.id}';`,
      function(err, result, fields) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }

        if(result.affectedRows == 0){
          console.log(result);
          res.status(400).json({errors: "No Lead with id found"});
          return;
        }

        console.log("Update lead with id "+req.params.id);
        res.json({"result":"completed", "lead_id":req.params.id});
      });
      connection.commit();
  })
  .delete([],
          (req , res) => {
          var quote = req.body;
          connection.query(
          `DELETE FROM ${table} WHERE lead_id = '${req.params.id}';`,
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

            console.log("Lead deleted with id "+req.params.id);
            res.json({"result":"completed", "lead_id":req.params.id});
          });
          connection.commit();
  });
      

module.exports = router;
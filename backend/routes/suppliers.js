/** REST Enpoint for interacting with Suppliers in the DB */
const e = require('cors');
var express = require('express');
var router = express.Router();
const { check, exists, not,notEmpty, isEmpty, trim, escape, isDate, isEmail, normalizeEmail, validationResult } = require('express-validator');



var DataBaseHandler = require("../config/DataBaseHandler");
var dataBaseHandler = new DataBaseHandler();

var connection = dataBaseHandler.createConnection();

const supplier_table = `Supplier`;

/*Get all suppliers
  Post new supplier*/
  router.route('/')
  .get((req, res) => {
    var results = [];
    connection.query(
      `SELECT * FROM ${supplier_table};`, function (err, rows) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }
          rows.forEach((element) => {
            results.push(
                {
                    "supplier_id" : element.supplier_id,
                    "name": element.name,
                    "email": element.email,
                    "phone": element.phone
                });
        });
        console.log("[ENDPOINT] GET All Suppliers", results);
        res.json(results);
      });
  })
  .post([ check("name").exists().not().isEmpty().trim().escape(),
          check("email").exists().not().isEmpty().trim().escape(),
          check("phone").exists().not().isEmpty().trim().escape()],(req , res) => {

            const errors = validationResult(req);
            if (!errors.isEmpty())
            {
              console.log(errors);
              return res.status(400).json({ errors: errors.array() });
            }

            var supplier = req.body;
            connection.query(
            `INSERT INTO ${supplier_table} (name, email, phone)\
            VALUES (?, ?, ?)`,
            [supplier.name, supplier.email, supplier.phone], 
            function(err, result, fields) {
              if (err){
                console.log(err);
                res.status(400).json({ errors: err})
                return;
              }

              if(result.affectedRows == 0){
                console.log(result);
                res.status(400).json({errors: "No Supplier with id found"});
                return;
              }

              console.log("Last supplier inserted id = "+result.insertId);
              res.json({"result":"completed", "supplier_id":result.insertId});
            });
            connection.commit();
  });


/*Get specific supplier
  Update or delete specific supplier*/
router.route('/:supplier_id')
.get((req , res) => {
  var results = [];
  connection.query(
    `SELECT * FROM ${supplier_table} WHERE supplier_id=${req.params.supplier_id}`, function (err, rows) {
      if (err){
        console.log(err);
        res.status(400).json({ errors: err})
        return;
      }
        rows.forEach((element) => {
          results.push(
              {
                  "supplier_id": element.supplier_id,
                  "name": element.name,
                  "email": element.email,
                  "phone": element.phone
              });
      });

      if(results.length == 0){
        res.status(400).json({errors: "No Supplier with ID found"})
      }

      console.log(`[ENDPOINT] GET Specific suppler with id:${req.params.supplier_id}`, results);
      res.json(results);
    });
})
.put([check("name").exists().not().isEmpty().trim().escape(),
      check("phone").exists().not().isEmpty().trim().escape(),
      check("email").exists().not().isEmpty().trim().escape()],(req , res) => {

  const errors = validationResult(req);
            if (!errors.isEmpty())
            {
              console.log(errors);
              return res.status(400).json({ errors: errors.array() });
            }
  var supplier = req.body;
  connection.query(
  `UPDATE ${supplier_table} SET name = '${supplier.name}', email = '${supplier.email}', phone = '${supplier.phone}'\
  WHERE supplier_id = '${req.params.supplier_id}';`,
  function(err, result, fields) {
    if (err){
      console.log(err);
      res.status(400).json({ errors: err})
      return;
    }

    if(result.affectedRows == 0){
      console.log(result);
      res.status(400).json({errors: "No Supplier with id found"});
      return;
    }

    console.log("Update supplier with id "+req.params.supplier_id);
    res.json({"result":"completed", "supplier_id":req.params.supplier_id});
  });
  connection.commit();
})
.delete((req , res) => {
  var supplier = req.body;
  connection.query(
  `DELETE FROM ${supplier_table} WHERE supplier_id = '${req.params.supplier_id}';`,
  function(err, result, fields) {
    if (err){
      console.log(err);
      res.status(400).json({ errors: err})
      return;
    }

    if(result.affectedRows == 0){
      console.log(result);
      res.status(400).json({errors: "No Supplier with id found"});
      return;
    }

    console.log("Supplier deleted with id "+req.params.supplier_id);
    res.json({"result":"completed", "supplier_id":req.params.supplier_id});
  });
  connection.commit();
});

module.exports = router;

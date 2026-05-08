/** REST Enpoint for interacting with Items in the DB */
const e = require('cors');
var express = require('express');
var router = express.Router();
const { check, exists, not, notEmpty, isEmpty, trim, escape, isDate, isEmail, normalizeEmail, validationResult } = require('express-validator');

var DataBaseHandler = require("../config/DataBaseHandler");
var dataBaseHandler = new DataBaseHandler();

var connection = dataBaseHandler.createConnection();

const item_table = `Item`;

/*Get all items
  Post new item*/
  router.route('/')
  .get((req, res) => {
    var results = [];
    connection.query(
      `SELECT * FROM ${item_table};`, function (err, rows) {
          if (err)
          {
            console.log(err);
            res.status(400).json({errors: err});
          }
              
          rows.forEach((element) => {
            results.push(
                {
                    "item_id" : element.item_id,
                    "name": element.name,
                    "partNumber": element.partNumber,
                    "manufacturer": element.manufacturer,
                    "description": element.description
                });
        });
        console.log("[ENDPOINT] GET All Items", results);
        res.json(results);
      });
  })
  .post([ check('name').exists().not().isEmpty().trim().escape(),
          check('partNumber').exists().not().isEmpty().trim().escape(),
          check('manufacturer').exists().not().isEmpty().trim().escape(),
          check('description').exists().not().isEmpty().trim().escape()],
          (req , res) => {
    
              const errors = validationResult(req);
              if (!errors.isEmpty()) {
                  console.log(errors);
                  return res.status(400).json({ errors: errors.array() });
              }

              var item = req.body;
              connection.query(
              `INSERT INTO ${item_table} (name, partNumber, manufacturer, description)\
              VALUES (?, ?, ?, ?)`,
              [item.name, item.partNumber, item.manufacturer, item.description], 
              function(err, result, fields) {
                if (err){
                  console.log(err);
                  res.status(400).json({errors : err});
                  return;
                }
                console.log("Last item inserted id:"+result.insertId);
                res.json({"result":"completed", "item_id":result.insertId});
              });
              connection.commit();
  });


/*Get specific item
  Update or delete specific item*/
router.route('/:item_id')
.get(
    (req , res) => {
      
      var results = [];
      connection.query(
        `SELECT * FROM ${item_table} WHERE item_id=${req.params.item_id}`, function (err, rows) {
          if (err){
            console.log(err);
            res.status(400).json({errors : err});
            return;
          }
            rows.forEach((element) => {
              results.push(
                  {
                      "item_id": element.item_id,
                      "name": element.name,
                      "partNumber": element.partNumber,
                      "manufacturer": element.manufacturer,
                      "description": element.description
                  });
          });

          if(results.length == 0){
            res.status(400).json({errors: "No item with id found"});
            return;
          }
          console.log(`[ENDPOINT] GET Specific Item  with id:${req.params.item_id}`, results);
          res.json(results);
        });
})
.put([check('name').exists().not().isEmpty().trim().escape(),
      check('partNumber').exists().notEmpty().trim().escape(),
      check('manufacturer').exists().not().isEmpty().trim().escape(),
      check('description').exists().trim().escape()],
    (req , res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty())
            return res.status(400).json({ errors: errors.array() });
      
        var item = req.body;
        connection.query(
        `UPDATE ${item_table} SET name = '${item.name}', partNumber = '${item.partNumber}', manufacturer = '${item.manufacturer}',\
        description = '${item.description}' WHERE item_id = '${req.params.item_id}';`,
        function(err, result, fields) {
          if (err){
            console.log(err);
            res.status(400).json({errors : err});
            return;
          }

          if(result.affectedRows == 0)
          {
            res.status(400).json({errors : "No item with id found"});
            return;
          }

          console.log("Update item with id "+req.params.item_id);
          res.json({"result":"completed", "item_id":req.params.item_id});
        });
        connection.commit();
})
.delete(
        (req , res) => {


            var item = req.body;
            connection.query(
            `DELETE FROM ${item_table} WHERE item_id = '${req.params.item_id}';`,
            function(err, result, fields) {
              if (err){
                console.log(err);
                res.status(400).json({errors : err});
                return;
              }

              if(result.affectedRows == 0)
              {
                res.status(400).json({errors : "No item with id found"});
                return;
              }

              console.log("Item deleted with id "+req.params.item_id);
              res.status(200).json({"result":"completed", "item_id":req.params.item_id});
            });
            connection.commit();
});

module.exports = router;

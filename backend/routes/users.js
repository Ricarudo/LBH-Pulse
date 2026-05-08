/** REST Enpoint for interacting with Users in the DB */
const e = require('cors');
var express = require('express');
var router = express.Router();
const { check, exists, not, notEmpty, isEmpty, trim, escape, isDate, isEmail, normalizeEmail, validationResult } = require('express-validator');


var DataBaseHandler = require("../config/DataBaseHandler");
var dataBaseHandler = new DataBaseHandler();

var connection = dataBaseHandler.createConnection();

const user_table = `User`;

/*Get all users
  Post new user*/
  router.route('/')
  .get((req, res) => {
    var results = [];
    connection.query(
      `SELECT * FROM ${user_table};`, function (err, rows) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }
          rows.forEach((element) => {
            results.push(
                {
                    "user_id" : element.user_id,
                    "name": element.name,
                    "email": element.email,
                });
        });
        console.log("[ENDPOINT] GET All Users", results);
        res.json(results);
      });
  })
  .post([check("name").exists().not().isEmpty().trim().escape(),
          check("email").exists().not().isEmpty().trim().escape()],
      (req , res) => {
    console.log("posting user");
    var user = req.body;
    connection.query(
    `INSERT INTO ${user_table} (user_id, name, email)\
    VALUES (?, ?, ?)`,
    [user.user_id, user.name, user.email], 
    function(err, result, fields) {
      if (err){
        console.log(err);
        res.status(400).json({ errors: err})
        return;
      }
      else{

        if(result.affectedRows == 0){
          console.log(result);
          res.status(400).json({errors: "No User with id found"});
          return;
        }

      console.log("Last user inserted id = "+result.insertId);
      res.json({"result":"completed", "user_id":user.user_id});}
    });
    connection.commit();
  });


  /*Get specific user
    Update or delete specific user*/
  router.route('/:user_id')
  .get((req , res) => {
    var results = [];
    connection.query(
      `SELECT * FROM ${user_table} WHERE user_id=${req.params.user_id}`, function (err, rows) {
        if (err){
          console.log(err);
          res.status(400).json({ errors: err})
          return;
        }
          rows.forEach((element) => {
            results.push(
                {
                    "user_id": element.user_id,
                    "name": element.name,
                    "email": element.email
                });
        });
        console.log(`[ENDPOINT] GET Specific user with id:${req.params.user_id}`, results);
        res.json(results);
      });
  })
  .put([check("name").exists().not().isEmpty().trim().escape(),
  check("email").exists().not().isEmpty().trim().escape()],(req , res) => {
    var user = req.body;
    connection.query(
    `UPDATE ${user_table} SET name = '${user.name}', email = '${user.email}'\
    WHERE user_id = '${req.params.user_id}';`,
    function(err, result, fields) {
      if (err){
        console.log(err);
        res.status(400).json({ errors: err})
        return;
      }

      if(result.affectedRows == 0){
        console.log(result);
        res.status(400).json({errors: "No User with id found"});
        return;
      }

      console.log("Update user with id "+req.params.user_id);
      res.json({"result":"completed", "user_id":req.params.user_id});
    });
    connection.commit();
  })
  .delete((req , res) => {
    var user = req.body;
    connection.query(
    `DELETE FROM ${user_table} WHERE user_id = '${req.params.user_id}';`,
    function(err, result, fields) {
      if (err){
        console.log(err);
        res.status(400).json({ errors: err})
        return;
      }

      if(result.affectedRows == 0){
        console.log(result);
        res.status(400).json({errors: "No User with id found"});
        return;
      }

      console.log("User deleted with id: "+req.params.user_id);
      res.json({"result":"completed", "user_id":req.params.user_id});
    });
    connection.commit();
  });

  module.exports = router;

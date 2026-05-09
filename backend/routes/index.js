var express = require('express');
var router = express.Router();

router.use('/', (req, res, next) => {
  // TODO: Add backend JWT validation here when Azure/Entra auth is reintroduced.
  req.headers["content-type"] = 'application/json';
  console.log("Loaded Index");
  next();//cascades to lower API call with injected headers
})

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;

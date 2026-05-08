var express = require('express');
//const mysql = require('mysql');
var router = express.Router();

router.use('/', (req, res, next) => {
  //validate user, data, perms

  const authCodeUrlParameters = {
    scopes: ["user.read"],
    redirectUri: "http://localhost:6000/redirect",
  };

  pca.getAuthCodeUrl(authCodeUrlParameters).then((response) => {
      res.redirect(response);
  }).catch((error) => console.log(JSON.stringify(error)));


  req.headers["content-type"] = 'application/json';
  console.log("Loaded Index");
  next();//cascades to lower API call with injected headers
})

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;

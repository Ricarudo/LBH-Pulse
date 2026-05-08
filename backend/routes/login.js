require('dotenv').config();
var express = require('express');
var router = express.Router();

const SERVER_PORT = process.env.PORT ;

router.use('/login', (req, res, next) => {
  //validate
  //sanitize
  //pass to next method if possible
})

router.route('/:user/:id')
      .get((req , res) => {
        //validate

        const tokenRequest = {
                code: req.query.code,
                scopes: ["user.read"],
                redirectUri: `http://localhost:${SERVER_PORT}/redirect`,
        };
    
        pca.acquireTokenByCode(tokenRequest).then((response) => {
            console.log("\nResponse: \n:", response);
            res.sendStatus(200);
            }).catch((error) => {
                console.log(error);
                res.status(500).send(error);
            });

        res.send('Something as response')
      })
      .post((req , res) => {
        //processOurCrapHere();
        res.send('data received')
      })
      


module.exports = router;

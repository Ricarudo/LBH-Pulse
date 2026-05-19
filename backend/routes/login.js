var express = require('express');
var router = express.Router();

router.get('/', (req, res) => {
  res.json({
    mode: 'local-development',
    message: 'Local login is currently handled by the Pulse web app.'
  });
});

// TODO: Reintroduce Azure/Entra login here only after backend JWT validation
// middleware is designed and every protected API route enforces it.

module.exports = router;

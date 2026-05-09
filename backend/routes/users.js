/** REST endpoint for interacting with Users in the DB */
var express = require('express');
var router = express.Router();
const { check } = require('express-validator');
const prisma = require('../config/prisma');
const {
  asyncRoute,
  ensureValidRequest,
  nullableString,
  assertFound,
  assertChanged
} = require('../utils/route.utils');

function mapUser(user) {
  return {
    user_id: user.userId,
    name: user.name,
    email: user.email
  };
}

router.route('/')
  .get(asyncRoute(async (req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' }
    });

    res.json(users.map(mapUser));
  }))
  .post([
    check('user_id').exists().notEmpty().trim().escape(),
    check('name').exists().notEmpty().trim().escape(),
    check('email').exists().notEmpty().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const user = await prisma.user.create({
      data: {
        userId: nullableString(req.body.user_id),
        name: nullableString(req.body.name),
        email: nullableString(req.body.email)
      }
    });

    res.json({ result: 'completed', user_id: user.userId });
  }));

router.route('/:user_id')
  .get(asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { userId: req.params.user_id }
    });

    res.json([mapUser(assertFound(user, 'No User with id found'))]);
  }))
  .put([
    check('name').exists().notEmpty().trim().escape(),
    check('email').exists().notEmpty().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const result = await prisma.user.updateMany({
      where: { userId: req.params.user_id },
      data: {
        name: nullableString(req.body.name),
        email: nullableString(req.body.email)
      }
    });

    assertChanged(result, 'No User with id found');
    res.json({ result: 'completed', user_id: req.params.user_id });
  }))
  .delete(asyncRoute(async (req, res) => {
    const result = await prisma.user.deleteMany({
      where: { userId: req.params.user_id }
    });

    assertChanged(result, 'No User with id found');
    res.json({ result: 'completed', user_id: req.params.user_id });
  }));

module.exports = router;

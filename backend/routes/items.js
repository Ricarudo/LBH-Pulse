/** REST endpoint for interacting with Items in the DB */
var express = require('express');
var router = express.Router();
const { check } = require('express-validator');
const prisma = require('../config/prisma');
const {
  asyncRoute,
  ensureValidRequest,
  parseId,
  nullableString,
  assertFound,
  assertChanged
} = require('../utils/route.utils');

function mapItem(item) {
  return {
    item_id: item.itemId,
    name: item.name,
    partNumber: item.partNumber,
    manufacturer: item.manufacturer,
    description: item.description
  };
}

function itemData(body) {
  return {
    name: nullableString(body.name),
    partNumber: nullableString(body.partNumber),
    manufacturer: nullableString(body.manufacturer),
    description: nullableString(body.description)
  };
}

router.route('/')
  .get(asyncRoute(async (req, res) => {
    const items = await prisma.item.findMany({
      orderBy: { itemId: 'asc' }
    });

    res.json(items.map(mapItem));
  }))
  .post([
    check('name').exists().notEmpty().trim().escape(),
    check('partNumber').exists().notEmpty().trim().escape(),
    check('manufacturer').exists().notEmpty().trim().escape(),
    check('description').exists().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const item = await prisma.item.create({
      data: itemData(req.body)
    });

    res.json({ result: 'completed', item_id: item.itemId });
  }));

router.route('/:item_id')
  .get(asyncRoute(async (req, res) => {
    const itemId = parseId(req.params.item_id, 'item_id');
    const item = await prisma.item.findUnique({
      where: { itemId }
    });

    res.json([mapItem(assertFound(item, 'No item with id found'))]);
  }))
  .put([
    check('name').exists().notEmpty().trim().escape(),
    check('partNumber').exists().notEmpty().trim().escape(),
    check('manufacturer').exists().notEmpty().trim().escape(),
    check('description').exists().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const itemId = parseId(req.params.item_id, 'item_id');
    const result = await prisma.item.updateMany({
      where: { itemId },
      data: itemData(req.body)
    });

    assertChanged(result, 'No item with id found');
    res.json({ result: 'completed', item_id: itemId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const itemId = parseId(req.params.item_id, 'item_id');
    const result = await prisma.item.deleteMany({
      where: { itemId }
    });

    assertChanged(result, 'No item with id found');
    res.status(200).json({ result: 'completed', item_id: itemId });
  }));

module.exports = router;

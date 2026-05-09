/** REST endpoint for interacting with Suppliers in the DB */
var express = require('express');
var router = express.Router();
const { check } = require('express-validator');
const prisma = require('../config/prisma');
const {
  asyncRoute,
  ensureValidRequest,
  parseId,
  nullableInt,
  nullableString,
  assertFound,
  assertChanged
} = require('../utils/route.utils');

function mapSupplier(supplier) {
  return {
    supplier_id: supplier.supplierId,
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    point_of_contact_id: supplier.pointOfContactId
  };
}

function supplierData(body) {
  return {
    name: nullableString(body.name),
    email: nullableString(body.email),
    phone: nullableInt(body.phone),
    pointOfContactId: nullableInt(body.point_of_contact_id)
  };
}

router.route('/')
  .get(asyncRoute(async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { supplierId: 'asc' }
    });

    res.json(suppliers.map(mapSupplier));
  }))
  .post([
    check('name').exists().notEmpty().trim().escape(),
    check('email').exists().notEmpty().trim().escape(),
    check('phone').exists().notEmpty().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const supplier = await prisma.supplier.create({
      data: supplierData(req.body)
    });

    res.json({ result: 'completed', supplier_id: supplier.supplierId });
  }));

router.route('/:supplier_id')
  .get(asyncRoute(async (req, res) => {
    const supplierId = parseId(req.params.supplier_id, 'supplier_id');
    const supplier = await prisma.supplier.findUnique({
      where: { supplierId }
    });

    res.json([mapSupplier(assertFound(supplier, 'No Supplier with ID found'))]);
  }))
  .put([
    check('name').exists().notEmpty().trim().escape(),
    check('phone').exists().notEmpty().trim().escape(),
    check('email').exists().notEmpty().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const supplierId = parseId(req.params.supplier_id, 'supplier_id');
    const result = await prisma.supplier.updateMany({
      where: { supplierId },
      data: supplierData(req.body)
    });

    assertChanged(result, 'No Supplier with id found');
    res.json({ result: 'completed', supplier_id: supplierId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const supplierId = parseId(req.params.supplier_id, 'supplier_id');
    const result = await prisma.supplier.deleteMany({
      where: { supplierId }
    });

    assertChanged(result, 'No Supplier with id found');
    res.json({ result: 'completed', supplier_id: supplierId });
  }));

module.exports = router;

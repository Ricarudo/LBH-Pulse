/** REST endpoint for interacting with Quotes in the DB */
var express = require('express');
var router = express.Router();
const { check } = require('express-validator');
const prisma = require('../config/prisma');
const {
  asyncRoute,
  ensureValidRequest,
  parseId,
  nullableFloat,
  nullableInt,
  nullableString,
  assertFound,
  assertChanged
} = require('../utils/route.utils');

function mapQuote(quote) {
  return {
    quote_id: quote.quoteId,
    r2_id: quote.r2Id,
    lead_id: quote.leadId,
    state_id: quote.stateId,
    client_id: quote.clientId,
    client_site_id: quote.clientSiteId,
    point_of_contact_id: quote.pointOfContactId,
    dueDate: quote.dueDate,
    dateReceived: quote.dateReceived,
    dateCreated: quote.dateCreated,
    title: quote.title,
    projectDescription: quote.projectDescription,
    comments: quote.comments,
    current_employee_id: quote.currentEmployeeId,
    proposalSpecifications: quote.proposalSpecifications
  };
}

function mapBomEntry(entry) {
  return {
    bill_of_materials_entry_id: entry.billOfMaterialsEntryId,
    quote_id: entry.quoteId,
    item_id: entry.itemId,
    quantity: entry.quantity,
    workers: entry.workers,
    unitHours: entry.unitHours,
    rate: entry.rate,
    materialCost: entry.materialCost,
    contingencyPercent: entry.contingencyPercent,
    freightPercent: entry.freightPercent,
    profitMarkup: entry.profitMarkup,
    supplier: entry.supplier
  };
}

function mapLaborCost(cost) {
  return {
    labor_cost_id: cost.laborCostId,
    quote_id: cost.quoteId,
    bill_of_materials_entry_id: cost.billOfMaterialsEntryId,
    workers: cost.workers,
    hours: cost.hours,
    costWorker: cost.costWorker,
    extCost: cost.extCost,
    ratio: cost.ratio,
    unitCost: cost.unitCost,
    totalCost: cost.totalCost
  };
}

function mapMaterialCost(cost) {
  return {
    material_cost_id: cost.materialCostId,
    quote_id: cost.quoteId,
    bill_of_materials_entry_id: cost.billOfMaterialsEntryId,
    materialCost: cost.materialCost,
    contigency: cost.contigency,
    freight: cost.freight,
    taxes: cost.taxes,
    profit: cost.profit,
    unitCost: cost.unitCost,
    extMaterialCost: cost.extMaterialCost,
    taxFreight: cost.taxFreight,
    cost: cost.cost,
    supplier_id: cost.supplierId,
    supplier_quote: cost.supplierQuote
  };
}

function quoteData(body, currentEmployeeId) {
  return {
    r2Id: nullableString(body.r2_id),
    leadId: nullableInt(body.lead_id),
    stateId: nullableInt(body.state_id),
    clientId: nullableInt(body.client_id),
    clientSiteId: nullableInt(body.client_site_id),
    pointOfContactId: nullableInt(body.point_of_contact_id),
    dueDate: nullableString(body.dueDate),
    dateReceived: nullableString(body.dateReceived),
    dateCreated: nullableString(body.dateCreated),
    title: nullableString(body.title),
    projectDescription: nullableString(body.projectDescription),
    comments: nullableString(body.comments),
    currentEmployeeId: nullableString(currentEmployeeId !== undefined ? currentEmployeeId : body.current_employee_id),
    proposalSpecifications: nullableString(body.proposalSpecifications)
  };
}

function bomEntryData(body, quoteId) {
  return {
    quoteId,
    itemId: nullableInt(body.item_id),
    quantity: nullableInt(body.quantity),
    workers: nullableInt(body.workers),
    unitHours: nullableFloat(body.unitHours),
    rate: nullableFloat(body.rate),
    materialCost: nullableFloat(body.materialCost),
    contingencyPercent: nullableFloat(body.contingencyPercent),
    freightPercent: nullableFloat(body.freightPercent),
    profitMarkup: nullableFloat(body.profitMarkup),
    supplier: nullableString(body.supplier)
  };
}

router.route('/')
  .get(asyncRoute(async (req, res) => {
    const quotes = await prisma.quote.findMany({
      orderBy: { quoteId: 'asc' }
    });

    res.json(quotes.map(mapQuote));
  }))
  .post([
    check('r2_id').exists(),
    check('lead_id').exists().notEmpty(),
    check('state_id').exists().notEmpty(),
    check('client_id').exists().notEmpty(),
    check('client_site_id').exists().notEmpty(),
    check('point_of_contact_id').exists(),
    check('dueDate').exists().notEmpty(),
    check('dateReceived').exists().notEmpty(),
    check('dateCreated').exists().notEmpty(),
    check('title').exists().notEmpty(),
    check('projectDescription').exists(),
    check('comments').exists(),
    check('current_employee_id').exists().notEmpty(),
    check('proposalSpecifications').exists()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const quote = await prisma.quote.create({
      data: quoteData(req.body)
    });

    res.json({ result: 'completed', quote_id: quote.quoteId });
  }));

router.route('/user/:user_id')
  .get(asyncRoute(async (req, res) => {
    const quotes = await prisma.quote.findMany({
      where: { currentEmployeeId: req.params.user_id },
      orderBy: { quoteId: 'asc' }
    });

    res.json(quotes.map(mapQuote));
  }))
  .post([
    check('r2_id').exists(),
    check('lead_id').exists().notEmpty(),
    check('state_id').exists().notEmpty(),
    check('client_id').exists().notEmpty(),
    check('client_site_id').exists().notEmpty(),
    check('point_of_contact_id').exists().notEmpty(),
    check('dueDate').exists().notEmpty(),
    check('dateReceived').exists().notEmpty(),
    check('dateCreated').exists().notEmpty(),
    check('title').exists().notEmpty(),
    check('projectDescription').exists(),
    check('comments').exists()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const quote = await prisma.quote.create({
      data: quoteData(req.body, req.params.user_id)
    });

    res.json({ result: 'completed', quote_id: quote.quoteId });
  }));

router.route('/user/:user_id/:quote_id')
  .get(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const quotes = await prisma.quote.findMany({
      where: {
        quoteId,
        currentEmployeeId: req.params.user_id
      }
    });

    res.json(quotes.map(mapQuote));
  }))
  .put([
    check('r2_id').exists().notEmpty(),
    check('lead_id').exists().notEmpty(),
    check('state_id').exists().notEmpty(),
    check('client_id').exists().notEmpty(),
    check('client_site_id').exists().notEmpty(),
    check('point_of_contact_id').exists().notEmpty(),
    check('dueDate').exists().notEmpty(),
    check('dateReceived').exists().notEmpty(),
    check('dateCreated').exists().notEmpty(),
    check('title').exists().notEmpty(),
    check('projectDescription').exists(),
    check('comments').exists(),
    check('proposalSpecifications').exists()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const result = await prisma.quote.updateMany({
      where: {
        quoteId,
        currentEmployeeId: req.params.user_id
      },
      data: quoteData(req.body, req.params.user_id)
    });

    assertChanged(result, 'No Quote with id found');
    res.json({ result: 'completed', quote_id: quoteId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const result = await prisma.quote.deleteMany({
      where: {
        quoteId,
        currentEmployeeId: req.params.user_id
      }
    });

    assertChanged(result, 'No Quote with id found');
    res.json({ result: 'completed', quote_id: quoteId });
  }));

router.route('/:quote_id')
  .get(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const quote = await prisma.quote.findUnique({
      where: { quoteId }
    });

    res.json([mapQuote(assertFound(quote, 'No Quote with id found'))]);
  }))
  .put([
    check('r2_id').exists().notEmpty(),
    check('lead_id').exists().notEmpty(),
    check('state_id').exists().notEmpty(),
    check('client_id').exists().notEmpty(),
    check('client_site_id').exists().notEmpty(),
    check('point_of_contact_id').exists().notEmpty(),
    check('dueDate').exists().notEmpty(),
    check('dateReceived').exists().notEmpty(),
    check('dateCreated').exists().notEmpty(),
    check('title').exists().notEmpty(),
    check('projectDescription').exists(),
    check('comments').exists(),
    check('current_employee_id').exists().notEmpty(),
    check('proposalSpecifications').exists()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const result = await prisma.quote.updateMany({
      where: { quoteId },
      data: quoteData(req.body)
    });

    assertChanged(result, 'No Quote with id found');
    res.json({ result: 'completed', quote_id: quoteId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const result = await prisma.quote.deleteMany({
      where: { quoteId }
    });

    assertChanged(result, 'No Quote with id found');
    res.json({ result: 'completed', quote_id: quoteId });
  }));

router.route('/:quote_id/bom')
  .get(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const entries = await prisma.billOfMaterialsEntry.findMany({
      where: { quoteId },
      orderBy: { billOfMaterialsEntryId: 'asc' }
    });

    res.json(entries.map(mapBomEntry));
  }))
  .post([
    check('item_id').exists(),
    check('quantity').exists(),
    check('workers').exists(),
    check('unitHours').exists(),
    check('rate').exists(),
    check('materialCost').exists(),
    check('contingencyPercent').exists(),
    check('freightPercent').exists(),
    check('profitMarkup').exists(),
    check('supplier').exists()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const entry = await prisma.billOfMaterialsEntry.create({
      data: bomEntryData(req.body, quoteId)
    });

    res.json({
      result: 'completed',
      bill_of_materials_entry_id: entry.billOfMaterialsEntryId
    });
  }));

router.route('/:quote_id/bom/:entry_id/laborcosts')
  .get(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const entryId = parseId(req.params.entry_id, 'entry_id');
    const laborCost = await prisma.laborCost.findFirst({
      where: {
        quoteId,
        billOfMaterialsEntryId: entryId
      }
    });

    res.json(laborCost ? mapLaborCost(laborCost) : null);
  }));

router.route('/:quote_id/bom/:entry_id/materialcosts')
  .get(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const entryId = parseId(req.params.entry_id, 'entry_id');
    const materialCosts = await prisma.materialCost.findMany({
      where: {
        quoteId,
        billOfMaterialsEntryId: entryId
      },
      orderBy: { materialCostId: 'asc' }
    });

    res.json(materialCosts.map(mapMaterialCost));
  }));

router.route('/:quote_id/bom/:entry_id')
  .get(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const entryId = parseId(req.params.entry_id, 'entry_id');
    const entry = await prisma.billOfMaterialsEntry.findFirst({
      where: {
        billOfMaterialsEntryId: entryId,
        quoteId
      }
    });

    res.json([mapBomEntry(assertFound(entry, 'No BOM entry with id found'))]);
  }))
  .put([
    check('item_id').exists().notEmpty(),
    check('quantity').exists().notEmpty(),
    check('workers').exists(),
    check('unitHours').exists(),
    check('rate').exists(),
    check('materialCost').exists(),
    check('contingencyPercent').exists(),
    check('freightPercent').exists(),
    check('profitMarkup').exists(),
    check('supplier').exists()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const entryId = parseId(req.params.entry_id, 'entry_id');
    const result = await prisma.billOfMaterialsEntry.updateMany({
      where: {
        billOfMaterialsEntryId: entryId,
        quoteId
      },
      data: bomEntryData(req.body, quoteId)
    });

    assertChanged(result, 'No BOM entry with id found');
    res.json({ result: 'completed', entry_id: entryId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const quoteId = parseId(req.params.quote_id, 'quote_id');
    const entryId = parseId(req.params.entry_id, 'entry_id');
    const result = await prisma.billOfMaterialsEntry.deleteMany({
      where: {
        billOfMaterialsEntryId: entryId,
        quoteId
      }
    });

    assertChanged(result, 'No BOM entry with id found');
    res.json({ result: 'completed', entry_id: entryId });
  }));

module.exports = router;

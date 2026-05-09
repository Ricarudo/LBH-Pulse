/** REST endpoint for interacting with Leads in the DB */
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

function mapLead(lead) {
  return {
    lead_id: lead.leadId,
    state_id: lead.stateId,
    client_id: lead.clientId,
    client_site_id: lead.clientSiteId,
    point_of_contact_id: lead.pointOfContactId,
    assigned_employee_id: lead.assignedEmployeeId,
    title: lead.title,
    dueDate: lead.dueDate,
    dateReceived: lead.dateReceived,
    dateCreated: lead.dateCreated,
    projectDescription: lead.projectDescription,
    comments: lead.comments
  };
}

function leadData(body) {
  return {
    stateId: nullableInt(body.state_id),
    clientId: nullableInt(body.client_id),
    clientSiteId: nullableInt(body.client_site_id),
    pointOfContactId: nullableInt(body.point_of_contact_id),
    assignedEmployeeId: nullableString(body.assigned_employee_id),
    title: nullableString(body.title),
    dueDate: nullableString(body.dueDate),
    dateReceived: nullableString(body.dateReceived),
    dateCreated: nullableString(body.dateCreated),
    projectDescription: nullableString(body.projectDescription),
    comments: nullableString(body.comments)
  };
}

router.route('/')
  .get(asyncRoute(async (req, res) => {
    const leads = await prisma.lead.findMany({
      orderBy: { leadId: 'asc' }
    });

    res.json(leads.map(mapLead));
  }))
  .post([
    check('title').exists().notEmpty().trim().escape(),
    check('dueDate').exists().notEmpty().trim().escape(),
    check('dateReceived').exists().notEmpty().trim().escape(),
    check('client_id').exists().notEmpty().trim().escape(),
    check('client_site_id').exists().notEmpty().trim().escape(),
    check('point_of_contact_id').exists().notEmpty().trim().escape(),
    check('comments').exists().trim().escape(),
    check('projectDescription').exists().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const lead = await prisma.lead.create({
      data: leadData(req.body)
    });

    res.json({ result: 'completed', lead_id: lead.leadId });
  }));

router.route('/:id')
  .get(asyncRoute(async (req, res) => {
    const leadId = parseId(req.params.id, 'lead_id');
    const lead = await prisma.lead.findUnique({
      where: { leadId }
    });

    res.json([mapLead(assertFound(lead, 'No Lead with id found'))]);
  }))
  .put([
    check('title').exists().notEmpty().trim().escape(),
    check('dueDate').exists().notEmpty().trim().escape(),
    check('dateReceived').exists().notEmpty().trim().escape(),
    check('client_id').exists().notEmpty().trim().escape(),
    check('client_site_id').exists().notEmpty().trim().escape(),
    check('point_of_contact_id').exists().notEmpty().trim().escape(),
    check('comments').exists().trim().escape(),
    check('projectDescription').exists().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const leadId = parseId(req.params.id, 'lead_id');
    const result = await prisma.lead.updateMany({
      where: { leadId },
      data: leadData(req.body)
    });

    assertChanged(result, 'No Lead with id found');
    res.json({ result: 'completed', lead_id: leadId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const leadId = parseId(req.params.id, 'lead_id');
    const result = await prisma.lead.deleteMany({
      where: { leadId }
    });

    assertChanged(result, 'No Lead with id found');
    res.json({ result: 'completed', lead_id: leadId });
  }));

module.exports = router;

/** REST endpoint for interacting with Clients in the DB */
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

function mapClient(client) {
  return {
    client_id: client.clientId,
    companyName: client.companyName,
    comments: client.comments
  };
}

function mapClientSite(clientSite) {
  return {
    client_site_id: clientSite.clientSiteId,
    client_id: nullableInt(clientSite.clientId),
    name: clientSite.name,
    address: clientSite.address,
    comments: clientSite.comments
  };
}

function mapPointOfContact(pointOfContact) {
  return {
    point_of_contact_id: pointOfContact.pointOfContactId,
    client_id: pointOfContact.clientId,
    name: pointOfContact.name,
    email: pointOfContact.email,
    phone: pointOfContact.phone,
    job_title: pointOfContact.jobTitle,
    comments: pointOfContact.comments
  };
}

function clientData(body) {
  return {
    companyName: nullableString(body.companyName),
    comments: nullableString(body.comments)
  };
}

function clientSiteData(body, clientId) {
  return {
    clientId: nullableString(clientId !== undefined ? clientId : body.client_id),
    name: nullableString(body.name),
    address: nullableString(body.address),
    comments: nullableString(body.comments)
  };
}

function pointOfContactData(body, clientId) {
  return {
    clientId: nullableInt(clientId !== undefined ? clientId : body.client_id),
    name: nullableString(body.name),
    email: nullableString(body.email),
    phone: nullableString(body.phone),
    jobTitle: nullableString(body.job_title),
    comments: nullableString(body.comments)
  };
}

router.route('/')
  .get(asyncRoute(async (req, res) => {
    const clients = await prisma.client.findMany({
      orderBy: { clientId: 'asc' }
    });

    res.json(clients.map(mapClient));
  }))
  .post([
    check('comments').exists().trim().escape(),
    check('companyName').exists().notEmpty().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const client = await prisma.client.create({
      data: clientData(req.body)
    });

    res.json({ result: 'completed', client_id: client.clientId });
  }));

router.route('/:id')
  .get(asyncRoute(async (req, res) => {
    const clientId = parseId(req.params.id, 'client_id');
    const client = await prisma.client.findUnique({
      where: { clientId }
    });

    res.json([mapClient(assertFound(client, 'No Client with id found'))]);
  }))
  .put([
    check('comments').exists().trim().escape(),
    check('companyName').exists().notEmpty().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const clientId = parseId(req.params.id, 'client_id');
    const result = await prisma.client.updateMany({
      where: { clientId },
      data: clientData(req.body)
    });

    assertChanged(result, 'No Client with id found');
    res.json({ result: 'completed', client_id: clientId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const clientId = parseId(req.params.id, 'client_id');
    const result = await prisma.client.deleteMany({
      where: { clientId }
    });

    assertChanged(result, 'No Client with id found');
    res.json({ result: 'completed', client_id: clientId });
  }));

router.route('/:id/client_sites')
  .get(asyncRoute(async (req, res) => {
    const clientId = parseId(req.params.id, 'client_id');
    const clientSites = await prisma.clientSite.findMany({
      where: { clientId: String(clientId) },
      orderBy: { clientSiteId: 'asc' }
    });

    res.json(clientSites.map(mapClientSite));
  }))
  .post([
    check('name').exists().notEmpty().trim().escape(),
    check('comments').exists().trim().escape(),
    check('address').exists().notEmpty().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const clientId = parseId(req.params.id, 'client_id');
    const clientSite = await prisma.clientSite.create({
      data: clientSiteData(req.body, clientId)
    });

    res.json({ result: 'completed', client_site_id: clientSite.clientSiteId });
  }));

router.route('/:id/client_sites/:client_site_id')
  .get(asyncRoute(async (req, res) => {
    const clientSiteId = parseId(req.params.client_site_id, 'client_site_id');
    const clientSite = await prisma.clientSite.findUnique({
      where: { clientSiteId }
    });

    res.json([mapClientSite(assertFound(clientSite, 'No ClientSite with id found'))]);
  }))
  .put([
    check('name').exists().trim().notEmpty().escape(),
    check('comments').exists().trim().escape(),
    check('address').exists().trim().notEmpty().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const clientId = parseId(req.params.id, 'client_id');
    const clientSiteId = parseId(req.params.client_site_id, 'client_site_id');
    const result = await prisma.clientSite.updateMany({
      where: { clientSiteId },
      data: clientSiteData(req.body, clientId)
    });

    assertChanged(result, 'No ClientSite with id found');
    res.json({ result: 'completed', client_site_id: clientSiteId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const clientSiteId = parseId(req.params.client_site_id, 'client_site_id');
    const result = await prisma.clientSite.deleteMany({
      where: { clientSiteId }
    });

    assertChanged(result, 'No ClientSite with id found');
    res.json({ result: 'completed', client_site_id: clientSiteId });
  }));

router.route('/:id/poc')
  .get(asyncRoute(async (req, res) => {
    const clientId = parseId(req.params.id, 'client_id');
    const pointsOfContact = await prisma.pointOfContact.findMany({
      where: { clientId },
      orderBy: { pointOfContactId: 'asc' }
    });

    res.json(pointsOfContact.map(mapPointOfContact));
  }))
  .post([
    check('phone').exists().trim().escape(),
    check('name').exists().notEmpty().trim().escape(),
    check('email').exists().notEmpty().escape(),
    check('comments').exists().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const clientId = parseId(req.params.id, 'client_id');
    const pointOfContact = await prisma.pointOfContact.create({
      data: pointOfContactData(req.body, clientId)
    });

    res.json({ result: 'completed', poc_id: pointOfContact.pointOfContactId });
  }));

router.route('/:id/poc/:poc_id/')
  .get(asyncRoute(async (req, res) => {
    const pointOfContactId = parseId(req.params.poc_id, 'poc_id');
    const pointOfContact = await prisma.pointOfContact.findUnique({
      where: { pointOfContactId }
    });

    res.json([mapPointOfContact(assertFound(pointOfContact, 'No PointOfContact with id found'))]);
  }))
  .put([
    check('client_id').exists().trim().escape(),
    check('name').exists().trim().notEmpty().escape(),
    check('email').exists().trim().notEmpty().escape(),
    check('comments').exists().trim().escape(),
    check('job_title').exists().trim().escape()
  ], asyncRoute(async (req, res) => {
    if (!ensureValidRequest(req, res)) {
      return;
    }

    const pointOfContactId = parseId(req.params.poc_id, 'poc_id');
    const result = await prisma.pointOfContact.updateMany({
      where: { pointOfContactId },
      data: pointOfContactData(req.body, req.body.client_id)
    });

    assertChanged(result, 'No PointOfContact with id found');
    res.json({ result: 'completed', point_of_contact_id: pointOfContactId });
  }))
  .delete(asyncRoute(async (req, res) => {
    const pointOfContactId = parseId(req.params.poc_id, 'poc_id');
    const result = await prisma.pointOfContact.deleteMany({
      where: { pointOfContactId }
    });

    assertChanged(result, 'No PointOfContact with id found');
    res.json({ result: 'completed', point_of_contact_id: pointOfContactId });
  }));

module.exports = router;

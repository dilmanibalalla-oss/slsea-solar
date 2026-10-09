const { Substation, Installation } = require("../models");
const { nextId } = require("../models/counter");
const { substationSchema, parseId, noQuery, requireJson } = require("../validators");
const present = require("../presenters");
const scope = require("../services/scope");
const { fail } = require("../middleware/errors");

async function list(req, res) {
  noQuery(req);
  const rows = await scope.listSubstations(req.auth.user);
  res.json(rows.map(present.substation));
}

async function getOne(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const row = await scope.requireSubstation(req.auth.user, id);
  res.json(present.substation(row));
}

async function create(req, res) {
  noQuery(req);
  requireJson(req);
  const body = substationSchema.parse(req.body);
  const row = await Substation.create({ id: await nextId("substation"), ...body });
  res.status(201).json(present.substation(row.toObject()));
}

async function replace(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = substationSchema.parse(req.body);
  const current = await Substation.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Substation not found");
  const row = await Substation.findOneAndUpdate({ id }, body, { new: true }).lean();
  res.json(present.substation(row));
}

async function patch(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = substationSchema.partial().parse(req.body);
  if (Object.keys(body).length === 0) fail(400, "VALIDATION_ERROR", "Validation failed");
  const current = await Substation.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Substation not found");
  const row = await Substation.findOneAndUpdate({ id }, { $set: body }, { new: true }).lean();
  res.json(present.substation(row));
}

async function remove(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const current = await Substation.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Substation not found");
  const child = await Installation.exists({ substation_id: id });
  if (child) fail(409, "RESOURCE_HAS_CHILDREN", "Remove dependent resources before deleting this resource");
  await Substation.deleteOne({ id });
  res.status(204).end();
}

async function listInstallations(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  await scope.requireSubstation(req.auth.user, id);
  const rows = await scope.listInstallations(req.auth.user, id);
  res.json(rows.map(present.installation));
}

module.exports = { list, getOne, create, replace, patch, remove, listInstallations };

const { Province, District } = require("../models");
const { nextId } = require("../models/counter");
const { provinceSchema } = require("../validators");
const { parseId, noQuery, requireJson } = require("../validators");
const present = require("../presenters");
const scope = require("../services/scope");
const { fail } = require("../middleware/errors");

async function list(req, res) {
  noQuery(req);
  const rows = await scope.listProvinces(req.auth.user);
  res.json(rows.map(present.province));
}

async function getOne(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const row = await scope.requireProvince(req.auth.user, id);
  res.json(present.province(row));
}

async function create(req, res) {
  noQuery(req);
  requireJson(req);
  const body = provinceSchema.parse(req.body);
  const row = await Province.create({ id: await nextId("province"), ...body, code: body.code.toUpperCase() });
  res.status(201).json(present.province(row.toObject()));
}

async function replace(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = provinceSchema.parse(req.body);
  const current = await Province.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Province not found");
  const row = await Province.findOneAndUpdate(
    { id },
    { name: body.name, code: body.code.toUpperCase() },
    { new: true }
  ).lean();
  res.json(present.province(row));
}

async function patch(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = provinceSchema.partial().parse(req.body);
  if (Object.keys(body).length === 0) fail(400, "VALIDATION_ERROR", "Validation failed");
  const current = await Province.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Province not found");
  if (body.code) body.code = body.code.toUpperCase();
  const row = await Province.findOneAndUpdate({ id }, { $set: body }, { new: true }).lean();
  res.json(present.province(row));
}

async function remove(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const current = await Province.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Province not found");
  const child = await District.exists({ province_id: id });
  if (child) fail(409, "RESOURCE_HAS_CHILDREN", "Remove dependent resources before deleting this resource");
  await Province.deleteOne({ id });
  res.status(204).end();
}

async function listDistricts(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  await scope.requireProvince(req.auth.user, id);
  const rows = await scope.listDistricts(req.auth.user, id);
  res.json(rows.map(present.district));
}

module.exports = { list, getOne, create, replace, patch, remove, listDistricts };

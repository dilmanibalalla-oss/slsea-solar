const { randomBytes } = require("node:crypto");
const { Installation, Reading, Substation } = require("../models");
const { nextId } = require("../models/counter");
const {
  installationCreateSchema, installationWriteSchema, installationPatchSchema,
  parseId, noQuery, requireJson
} = require("../validators");
const present = require("../presenters");
const scope = require("../services/scope");
const { fail } = require("../middleware/errors");

async function list(req, res) {
  noQuery(req);
  const rows = await scope.listInstallations(req.auth.user);
  res.json(rows.map(present.installation));
}

async function getOne(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const row = await scope.requireInstallation(req.auth.user, id);
  const last = await Reading.findOne({ installation_id: id }).sort({ timestamp: -1, id: -1 }).lean();
  res.json({
    ...present.installation(row),
    last_reading: last ? present.reading(last) : null
  });
}

async function create(req, res) {
  noQuery(req);
  requireJson(req);
  const body = installationCreateSchema.parse(req.body);
  const substation = await Substation.findOne({ id: body.substation_id }).lean();
  if (!substation) fail(404, "RESOURCE_NOT_FOUND", "Substation not found");
  const apiKey = randomBytes(32).toString("hex");
  const row = await Installation.create({
    id: await nextId("installation"),
    ...body,
    api_key: apiKey,
    deleted_at: null
  });
  res.set("Location", `${req.protocol}://${req.get("host")}${req.originalUrl}/${row.id}`);
  res.set("Cache-Control", "no-store");
  res.status(201).json({
    installation: present.installation(row.toObject()),
    api_key: apiKey
  });
}

async function replace(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = installationWriteSchema.parse(req.body);
  const current = await Installation.findOne({ id, deleted_at: null }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Solar installation not found");
  const row = await Installation.findOneAndUpdate(
    { id, deleted_at: null },
    {
      name: body.name,
      meter_id: body.meter_id,
      inverter_id: body.inverter_id,
      substation_id: body.substation_id,
      latitude: body.latitude,
      longitude: body.longitude,
      capacity_kw: body.capacity_kw
    },
    { new: true }
  ).lean();
  res.json(present.installation(row));
}

async function patch(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = installationPatchSchema.parse(req.body);
  if (Object.keys(body).length === 0) fail(400, "VALIDATION_ERROR", "Validation failed");
  const current = await Installation.findOne({ id, deleted_at: null }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Solar installation not found");
  const row = await Installation.findOneAndUpdate({ id, deleted_at: null }, { $set: body }, { new: true }).lean();
  res.json(present.installation(row));
}

async function remove(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const current = await Installation.findOne({ id, deleted_at: null }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "Solar installation not found");
  await Installation.updateOne({ id }, { $set: { deleted_at: new Date() } });
  res.json({ message: "Solar installation deleted successfully", id });
}

module.exports = { list, getOne, create, replace, patch, remove };

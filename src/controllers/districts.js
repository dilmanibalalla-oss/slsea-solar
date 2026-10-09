const { District, Substation, Reading } = require("../models");
const { nextId } = require("../models/counter");
const { districtSchema, parseId, noQuery, requireJson } = require("../validators");
const present = require("../presenters");
const scope = require("../services/scope");
const { fail } = require("../middleware/errors");

async function list(req, res) {
  noQuery(req);
  const rows = await scope.listDistricts(req.auth.user);
  res.json(rows.map(present.district));
}

async function getOne(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const row = await scope.requireDistrict(req.auth.user, id);
  res.json(present.district(row));
}

async function create(req, res) {
  noQuery(req);
  requireJson(req);
  const body = districtSchema.parse(req.body);
  const row = await District.create({
    id: await nextId("district"),
    ...body,
    code: body.code.toUpperCase()
  });
  res.status(201).json(present.district(row.toObject()));
}

async function replace(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = districtSchema.parse(req.body);
  const current = await District.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "District not found");
  const row = await District.findOneAndUpdate(
    { id },
    { name: body.name, code: body.code.toUpperCase(), province_id: body.province_id },
    { new: true }
  ).lean();
  res.json(present.district(row));
}

async function patch(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = districtSchema.partial().parse(req.body);
  if (Object.keys(body).length === 0) fail(400, "VALIDATION_ERROR", "Validation failed");
  const current = await District.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "District not found");
  if (body.code) body.code = body.code.toUpperCase();
  const row = await District.findOneAndUpdate({ id }, { $set: body }, { new: true }).lean();
  res.json(present.district(row));
}

async function remove(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const current = await District.findOne({ id }).lean();
  if (!current) fail(404, "RESOURCE_NOT_FOUND", "District not found");
  const child = await Substation.exists({ district_id: id });
  if (child) fail(409, "RESOURCE_HAS_CHILDREN", "Remove dependent resources before deleting this resource");
  await District.deleteOne({ id });
  res.status(204).end();
}

async function listSubstations(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  await scope.requireDistrict(req.auth.user, id);
  const rows = await scope.listSubstations(req.auth.user, id);
  res.json(rows.map(present.substation));
}

async function summary(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  const district = await scope.requireDistrict(req.auth.user, id);
  const substations = await scope.listSubstations(req.auth.user, id);
  const scoped = await scope.listInstallations(req.auth.user).then((rows) => {
    const allowed = new Set(substations.map((row) => row.id));
    return rows.filter((row) => allowed.has(row.substation_id));
  });
  const installationIds = scoped.map((row) => row.id);
  let current_power_kw = 0;
  let total_energy_kwh = 0;
  let peak_power_kw = 0;
  if (installationIds.length) {
    const latest = await Reading.aggregate([
      { $match: { installation_id: { $in: installationIds } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$installation_id",
          power_kw: { $first: "$power_kw" },
          cumulative_energy_kwh: { $first: "$cumulative_energy_kwh" }
        }
      }
    ]);
    for (const row of latest) {
      current_power_kw += row.power_kw || 0;
      total_energy_kwh += row.cumulative_energy_kwh || 0;
    }
    const peak = await Reading.aggregate([
      { $match: { installation_id: { $in: installationIds } } },
      { $group: { _id: null, peak: { $max: "$power_kw" } } }
    ]);
    peak_power_kw = peak[0] ? peak[0].peak : 0;
  }
  res.json({
    district_id: district.id,
    district_name: district.name,
    total_installations: scoped.length,
    current_power_kw: Number(current_power_kw.toFixed(3)),
    total_energy_kwh: Number(total_energy_kwh.toFixed(3)),
    peak_power_kw: Number(Number(peak_power_kw).toFixed(3))
  });
}

module.exports = { list, getOne, create, replace, patch, remove, listSubstations, summary };

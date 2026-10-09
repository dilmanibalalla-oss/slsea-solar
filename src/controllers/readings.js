const mongoose = require("mongoose");
const config = require("../config");
const { Installation, Reading } = require("../models");
const { requireReader, requireDevice } = require("../middleware/auth");
const { readingSchema, query, validateId, noQuery } = require("../validators");
const { sendRepresentation, paginate, sendPage } = require("../utils/http");
const { authorizedScope, accessibleResource } = require("../services/scope");
const { fail } = require("../middleware/errors");
async function readingCollection(req, res, installationId = null) {
  const options = query(req, true);
  if (installationId) {
    await accessibleResource(req.auth, "installations", installationId);
    if (options.installation && options.installation !== installationId) {
      fail(400, "CONFLICTING_FILTER", "Installation filter conflicts with URI");
    }
    options.installation = installationId;
  }
  const scope = await authorizedScope(req.auth, options);
  const filter = { installation: { $in: scope.installations.map((row) => row._id) } };
  if (options.from || options.to) {
    filter.timestamp = {};
    if (options.from) filter.timestamp.$gte = new Date(options.from);
    if (options.to) filter.timestamp.$lt = new Date(options.to);
  }
  const direction = options.sort === "timestamp" ? 1 : -1;
  const result = await paginate(req, Reading, filter, { timestamp: direction, _id: direction }, options);
  sendPage(req, res, result);
}
async function list(req, res) {
  await readingCollection(req, res);
}
async function listForInstallation(req, res) {
  const id = validateId(req.params.id);
  await readingCollection(req, res, id);
}
async function getOne(req, res) {
  noQuery(req);
  const id = validateId(req.params.id);
  const readingId = validateId(req.params.readingId);
  if (req.auth.kind === "device") requireDevice(req, id);
  else {
    requireReader(req, res, () => {});
    await accessibleResource(req.auth, "installations", id);
  }
  const reading = await Reading.findOne({ _id: readingId, installation: id }).lean();
  if (!reading) fail(404, "NOT_FOUND", "Reading not found");
  sendRepresentation(req, res, reading);
}
async function create(req, res) {
  noQuery(req);
  const id = validateId(req.params.id);
  requireDevice(req, id);
  const body = readingSchema.parse(req.body);
  const timestamp = new Date(body.timestamp);
  if (timestamp.getTime() > Date.now() + 5 * 60 * 1000) {
    fail(400, "FUTURE_TIMESTAMP", "Timestamp may not be more than five minutes in the future");
  }
  if (body.powerKw > req.auth.installation.capacityKw * 1.2) {
    fail(400, "IMPLAUSIBLE_POWER", "Power exceeds 120% of installation capacity");
  }
  let created;
  await mongoose.connection.transaction(async (session) => {
    const parent = await Installation.findByIdAndUpdate(id, { $inc: { __v: 1 } }, { new: true, session }).lean();
    if (!parent) fail(404, "NOT_FOUND", "Installation not found");
    // MongoDB transaction operations must run sequentially on this session.
    const previous = await Reading.findOne({
      installation: id, timestamp: { $lt: timestamp }
    }).sort({ timestamp: -1 }).session(session).lean();
    const following = await Reading.findOne({
      installation: id, timestamp: { $gt: timestamp }
    }).sort({ timestamp: 1 }).session(session).lean();
    if (previous && body.cumulativeEnergyKwh < previous.cumulativeEnergyKwh) {
      fail(409, "ENERGY_COUNTER_DECREASE", "Cumulative energy is lower than the preceding reading");
    }
    if (following && body.cumulativeEnergyKwh > following.cumulativeEnergyKwh) {
      fail(409, "ENERGY_COUNTER_INCONSISTENT", "Cumulative energy exceeds the following reading");
    }
    [created] = await Reading.create([{ ...body, timestamp, installation: id }], { session });
  });
  res.set("Location", `${config.base}/installations/${id}/readings/${created._id}`);
  sendRepresentation(req, res, created.toObject(), 201);
}
function immutable(req, res) {
  res.set("Allow", "GET, HEAD");
  fail(405, "METHOD_NOT_ALLOWED", "Historical readings are immutable");
}
module.exports = { list, listForInstallation, getOne, create, immutable };

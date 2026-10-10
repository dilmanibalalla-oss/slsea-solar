const { createHash } = require("node:crypto");
const config = require("../config");
const { Reading } = require("../models");
const { nextId } = require("../models/counter");
const { readingSchema, historyQuery, parseId, noQuery, requireJson } = require("../validators");
const present = require("../presenters");
const scope = require("../services/scope");
const { fail } = require("../middleware/errors");

const SORTABLE = new Set(["timestamp", "id", "power_kw", "cumulative_energy_kwh", "voltage"]);

function entityTag(value) {
  return `"${createHash("sha256").update(JSON.stringify(value)).digest("hex")}"`;
}

function historySort(options) {
  const direction = options.order === "asc" ? 1 : -1;
  const field = SORTABLE.has(options.sort) ? options.sort : "timestamp";
  if (field === "id") return { id: direction };
  return { [field]: direction, id: direction };
}

async function historyPeriodSummary(installationId, filter, options, count) {
  if (count < 2) return null;
  const from = options.from ? new Date(options.from) : null;
  const to = options.to ? new Date(options.to) : null;
  const start = from
    ? await Reading.findOne({ installation_id: installationId, timestamp: { $lte: from } }).sort({ timestamp: -1, id: -1 }).lean()
    : await Reading.findOne(filter).sort({ timestamp: 1, id: 1 }).lean();
  const end = to
    ? await Reading.findOne({ installation_id: installationId, timestamp: { $lte: to } }).sort({ timestamp: -1, id: -1 }).lean()
    : await Reading.findOne(filter).sort({ timestamp: -1, id: -1 }).lean();
  if (!start || !end) return null;
  const elapsedMs = new Date(end.timestamp) - new Date(start.timestamp);
  if (elapsedMs <= 0) return null;
  const series = await Reading.find({
    installation_id: installationId,
    timestamp: { $gte: start.timestamp, $lte: end.timestamp }
  }).sort({ timestamp: 1, id: 1 }).select("cumulative_energy_kwh").lean();
  for (let i = 1; i < series.length; i += 1) {
    if (series[i].cumulative_energy_kwh < series[i - 1].cumulative_energy_kwh) return null;
  }
  const energy = end.cumulative_energy_kwh - start.cumulative_energy_kwh;
  if (energy < 0) return null;
  const hours = elapsedMs / 3600000;
  return {
    energyGeneratedKwh: Number(energy.toFixed(3)),
    averagePowerKw: Number((energy / hours).toFixed(3)),
    readingCount: count
  };
}

async function periodFilter(id, options) {
  const filter = { installation_id: id };
  if (options.from || options.to) {
    filter.timestamp = {};
    if (options.from) filter.timestamp.$gte = new Date(options.from);
    if (options.to) filter.timestamp.$lte = new Date(options.to);
  }
  return filter;
}

async function period(req, res) {
  const id = parseId(req.params.id);
  await scope.requireInstallation(req.auth.user, id);
  const options = historyQuery(req);
  const filter = await periodFilter(id, options);
  const count = await Reading.countDocuments(filter);
  const summary = await historyPeriodSummary(id, filter, options, count);
  res.json({ summary });
}

async function latest(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  await scope.requireInstallation(req.auth.user, id);
  const row = await Reading.findOne({ installation_id: id }).sort({ timestamp: -1, id: -1 }).lean();
  if (!row) fail(404, "RESOURCE_NOT_FOUND", "Solar installation or readings not found");
  res.json(present.reading(row));
}

async function history(req, res) {
  const id = parseId(req.params.id);
  await scope.requireInstallation(req.auth.user, id);
  const options = historyQuery(req);
  const filter = await periodFilter(id, options);
  const skip = (options.page - 1) * options.limit;
  const [rows, count] = await Promise.all([
    Reading.find(filter).sort(historySort(options)).skip(skip).limit(options.limit).lean(),
    Reading.countDocuments(filter)
  ]);
  const summary = await historyPeriodSummary(id, filter, options, count);
  const origin = `${req.protocol}://${req.get("host")}`;
  const path = `${config.base}/installations/${id}/readings`;
  const link = (page) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(options.limit));
    if (options.from) params.set("from", options.from);
    if (options.to) params.set("to", options.to);
    if (options.sort) params.set("sort", options.sort);
    if (options.order) params.set("order", options.order);
    return `${origin}${path}?${params.toString()}`;
  };
  const pages = Math.ceil(count / options.limit) || 0;
  const body = {
    count,
    next: options.page < pages ? link(options.page + 1) : null,
    previous: options.page > 1 && pages > 0 ? link(options.page - 1) : null,
    data: rows.map(present.reading),
    summary
  };
  const tag = entityTag(body);
  res.set("ETag", tag);
  res.set("Cache-Control", "private, no-cache");
  if (req.get("If-None-Match") && req.get("If-None-Match") === tag) {
    return res.status(304).end();
  }
  res.json(body);
}

async function create(req, res) {
  noQuery(req);
  requireJson(req);
  const id = parseId(req.params.id);
  const body = readingSchema.parse(req.body);
  const timestamp = new Date(body.timestamp);
  if (Number.isNaN(timestamp.getTime())) fail(400, "VALIDATION_ERROR", "Invalid reading payload fields");
  const row = await Reading.create({
    id: await nextId("reading"),
    installation_id: id,
    timestamp,
    power_kw: body.power_kw,
    cumulative_energy_kwh: body.cumulative_energy_kwh,
    voltage: body.voltage
  });
  const presented = present.reading(row.toObject());
  const tag = entityTag(presented);
  res.set("Location", `${req.protocol}://${req.get("host")}${req.originalUrl}`);
  res.set("ETag", tag);
  res.set("Last-Modified", timestamp.toUTCString());
  res.status(201).json(presented);
}

module.exports = { latest, history, period, create };

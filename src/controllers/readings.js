const { createHash } = require("node:crypto");
const config = require("../config");
const { Reading, District, Substation } = require("../models");
const { nextId } = require("../models/counter");
const {
  readingSchema, historyQuery, regionalReadingsQuery, parseId, noQuery, requireJson
} = require("../validators");
const present = require("../presenters");
const scope = require("../services/scope");
const { fail } = require("../middleware/errors");
const { tagMatches } = require("../utils/http");

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

function periodSummaryResult(summary, reason) {
  return { summary, summary_unavailable_reason: reason };
}

async function historyPeriodSummary(installationId, filter, options, count) {
  if (count < 2) return periodSummaryResult(null, "insufficient_readings");
  const from = options.from ? new Date(options.from) : null;
  const to = options.to ? new Date(options.to) : null;
  const start = from
    ? await Reading.findOne({ installation_id: installationId, timestamp: { $lte: from } }).sort({ timestamp: -1, id: -1 }).lean()
    : await Reading.findOne(filter).sort({ timestamp: 1, id: 1 }).lean();
  const end = to
    ? await Reading.findOne({ installation_id: installationId, timestamp: { $lte: to } }).sort({ timestamp: -1, id: -1 }).lean()
    : await Reading.findOne(filter).sort({ timestamp: -1, id: -1 }).lean();
  if (!start || !end) return periodSummaryResult(null, "insufficient_readings");
  const elapsedMs = new Date(end.timestamp) - new Date(start.timestamp);
  if (elapsedMs <= 0) return periodSummaryResult(null, "insufficient_readings");
  const series = await Reading.find({
    installation_id: installationId,
    timestamp: { $gte: start.timestamp, $lte: end.timestamp }
  }).sort({ timestamp: 1, id: 1 }).select("cumulative_energy_kwh").lean();
  for (let i = 1; i < series.length; i += 1) {
    if (series[i].cumulative_energy_kwh < series[i - 1].cumulative_energy_kwh) {
      return periodSummaryResult(null, "meter_reset");
    }
  }
  const energy = end.cumulative_energy_kwh - start.cumulative_energy_kwh;
  if (energy < 0) return periodSummaryResult(null, "meter_reset");
  const hours = elapsedMs / 3600000;
  return periodSummaryResult({
    energyGeneratedKwh: Number(energy.toFixed(3)),
    averagePowerKw: Number((energy / hours).toFixed(3)),
    readingCount: count
  }, null);
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
  const { summary, summary_unavailable_reason } = await historyPeriodSummary(id, filter, options, count);
  res.json({ summary, summary_unavailable_reason });
}

async function getOne(req, res) {
  noQuery(req);
  const installationId = parseId(req.params.id);
  const readingId = parseId(req.params.readingId);
  await scope.requireInstallation(req.auth.user, installationId);
  const row = await Reading.findOne({ id: readingId, installation_id: installationId }).lean();
  if (!row) fail(404, "RESOURCE_NOT_FOUND", "Reading not found");
  res.json(present.reading(row));
}

async function latest(req, res) {
  noQuery(req);
  const id = parseId(req.params.id);
  await scope.requireInstallation(req.auth.user, id);
  const row = await Reading.findOne({ installation_id: id }).sort({ timestamp: -1, id: -1 }).lean();
  if (!row) fail(404, "RESOURCE_NOT_FOUND", "No readings found for this installation");
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
  const { summary, summary_unavailable_reason } = await historyPeriodSummary(id, filter, options, count);
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
    summary,
    summary_unavailable_reason
  };
  const tag = entityTag(body);
  res.set("ETag", tag);
  res.set("Cache-Control", "private, no-cache");
  if (tagMatches(req.get("If-None-Match"), tag, true)) {
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
  res.set(
    "Location",
    `${req.protocol}://${req.get("host")}${config.base}/installations/${id}/readings/${row.id}`
  );
  res.set("ETag", tag);
  res.set("Last-Modified", timestamp.toUTCString());
  res.status(201).json(presented);
}

async function assertConsistentGeography(options) {
  if (options.province_id != null && options.district_id != null) {
    const district = await District.findOne({ id: options.district_id }).lean();
    if (!district || district.province_id !== options.province_id) {
      fail(400, "VALIDATION_ERROR", "district_id is not in the requested province", [
        { path: "district_id", message: "district_id is not in the requested province" }
      ]);
    }
  }
  if (options.district_id != null && options.substation_id != null) {
    const substation = await Substation.findOne({ id: options.substation_id }).lean();
    if (!substation || substation.district_id !== options.district_id) {
      fail(400, "VALIDATION_ERROR", "substation_id is not in the requested district", [
        { path: "substation_id", message: "substation_id is not in the requested district" }
      ]);
    }
  }
  if (options.province_id != null && options.substation_id != null) {
    const substation = await Substation.findOne({ id: options.substation_id }).lean();
    const district = substation ? await District.findOne({ id: substation.district_id }).lean() : null;
    if (!district || district.province_id !== options.province_id) {
      fail(400, "VALIDATION_ERROR", "substation_id is not in the requested province", [
        { path: "substation_id", message: "substation_id is not in the requested province" }
      ]);
    }
  }
}

async function permittedInstallations(user, options) {
  if (options.province_id != null) await scope.requireProvince(user, options.province_id);
  if (options.district_id != null) await scope.requireDistrict(user, options.district_id);
  if (options.substation_id != null) await scope.requireSubstation(user, options.substation_id);
  await assertConsistentGeography(options);
  let rows = await scope.listInstallations(user);
  if (options.substation_id != null) {
    rows = rows.filter((row) => row.substation_id === options.substation_id);
  }
  if (options.district_id != null || options.province_id != null) {
    const substations = await scope.listSubstations(user);
    let allowed = new Set(substations.map((row) => row.id));
    if (options.district_id != null) {
      const inDistrict = new Set(
        substations.filter((row) => row.district_id === options.district_id).map((row) => row.id)
      );
      allowed = new Set([...allowed].filter((id) => inDistrict.has(id)));
    }
    if (options.province_id != null) {
      const districts = await District.find({ province_id: options.province_id }).lean();
      const districtIds = new Set(districts.map((row) => row.id));
      const inProvince = new Set(
        substations.filter((row) => districtIds.has(row.district_id)).map((row) => row.id)
      );
      allowed = new Set([...allowed].filter((id) => inProvince.has(id)));
    }
    rows = rows.filter((row) => allowed.has(row.substation_id));
  }
  return rows;
}

function regionalLink(req, origin, options, page) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(options.limit));
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.sort) params.set("sort", options.sort);
  if (options.order) params.set("order", options.order);
  if (options.province_id != null) params.set("province_id", String(options.province_id));
  if (options.district_id != null) params.set("district_id", String(options.district_id));
  if (options.substation_id != null) params.set("substation_id", String(options.substation_id));
  return `${origin}${config.base}/readings?${params.toString()}`;
}

async function regional(req, res) {
  const options = regionalReadingsQuery(req);
  const installations = await permittedInstallations(req.auth.user, options);
  const installationIds = installations.map((row) => row.id);
  const filter = { installation_id: { $in: installationIds } };
  if (options.from || options.to) {
    filter.timestamp = {};
    if (options.from) filter.timestamp.$gte = new Date(options.from);
    if (options.to) filter.timestamp.$lte = new Date(options.to);
  }
  if (!installationIds.length) {
    const empty = { count: 0, next: null, previous: null, data: [] };
    const tag = entityTag(empty);
    res.set("ETag", tag);
    res.set("Cache-Control", "private, no-cache");
    if (tagMatches(req.get("If-None-Match"), tag, true)) return res.status(304).end();
    return res.json(empty);
  }
  const skip = (options.page - 1) * options.limit;
  const [rows, count] = await Promise.all([
    Reading.find(filter).sort(historySort(options)).skip(skip).limit(options.limit).lean(),
    Reading.countDocuments(filter)
  ]);
  const origin = `${req.protocol}://${req.get("host")}`;
  const pages = Math.ceil(count / options.limit) || 0;
  const body = {
    count,
    next: options.page < pages ? regionalLink(req, origin, options, options.page + 1) : null,
    previous: options.page > 1 && pages > 0 ? regionalLink(req, origin, options, options.page - 1) : null,
    data: rows.map(present.reading)
  };
  const tag = entityTag(body);
  res.set("ETag", tag);
  res.set("Cache-Control", "private, no-cache");
  if (tagMatches(req.get("If-None-Match"), tag, true)) return res.status(304).end();
  res.json(body);
}

module.exports = { latest, history, period, create, getOne, regional };

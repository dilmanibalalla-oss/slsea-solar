const { Reading } = require("../models");
const { noQuery, validateId } = require("../validators");
const { sendRepresentation } = require("../utils/http");
const { authorizedScope, accessibleResource } = require("../services/scope");
const { handlers, listNested } = require("./metadata");
async function generationSummary(req, res) {
  noQuery(req);
  const id = validateId(req.params.id);
  const district = await accessibleResource(req.auth, "districts", id);
  const scope = await authorizedScope(req.auth, { district: id });
  const installationIds = scope.installations.map((row) => row._id);
  const now = new Date();
  const offsetMs = 330 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const dayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  async function lastPerInstallation(extra) {
    return Reading.aggregate([
      { $match: { installation: { $in: installationIds }, ...extra } },
      { $sort: { installation: 1, timestamp: -1 } },
      { $group: { _id: "$installation", reading: { $first: "$$ROOT" } } }
    ]);
  }
  const [latest, baselines, today] = await Promise.all([
    lastPerInstallation({ timestamp: { $lte: now } }),
    lastPerInstallation({ timestamp: { $lte: dayStart } }),
    lastPerInstallation({ timestamp: { $gte: dayStart, $lt: dayEnd, $lte: now } })
  ]);
  const baselineMap = new Map(baselines.map((row) => [String(row._id), row.reading]));
  let currentPowerKw = 0;
  let freshInstallationCount = 0;
  let newestTimestamp = null;
  for (const row of latest) {
    const timestamp = new Date(row.reading.timestamp);
    const age = now - timestamp;
    if (age <= 30 * 60 * 1000) {
      currentPowerKw += row.reading.powerKw;
      freshInstallationCount++;
    }
    if (!newestTimestamp || timestamp > newestTimestamp) newestTimestamp = timestamp;
  }
  let observedEnergyKwh = 0;
  let energyCoveredInstallationCount = 0;
  for (const row of today) {
    const baseline = baselineMap.get(String(row._id));
    if (baseline && dayStart - new Date(baseline.timestamp) <= 30 * 60 * 1000) {
      observedEnergyKwh += Math.max(0, row.reading.cumulativeEnergyKwh - baseline.cumulativeEnergyKwh);
      energyCoveredInstallationCount++;
    }
  }
  const referenceSlot = new Date(Math.floor(now.getTime() / (30 * 60 * 1000)) * (30 * 60 * 1000));
  sendRepresentation(req, res, {
    district: { _id: district._id, name: district.name },
    timezone: "Asia/Colombo", dayStart, dayEnd, referenceSlot,
    latestReadingTimestamp: newestTimestamp,
    installationCount: installationIds.length,
    reportingInstallationCount: latest.length,
    freshInstallationCount,
    staleOrMissingInstallationCount: installationIds.length - freshInstallationCount,
    currentPowerKw: Number(currentPowerKw.toFixed(3)),
    observedEnergyTodayKwh: Number(observedEnergyKwh.toFixed(3)),
    energyCoveredInstallationCount,
    energyCoverageComplete: energyCoveredInstallationCount === installationIds.length
  });
}
module.exports = {
  ...handlers("districts"),
  listSubstations: listNested("districts", "substations", "district"),
  generationSummary
};

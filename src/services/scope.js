const { Province, District, Substation, Installation } = require("../models");
const { fail } = require("../middleware/errors");

function forbidden() {
  fail(403, "FORBIDDEN", "Access denied: resource outside jurisdiction");
}

async function districtRecord(id) {
  return District.findOne({ id }).lean();
}

async function canAccessProvince(user, provinceId) {
  if (user.role === "admin" || user.role === "national") return true;
  if (user.role === "province") return user.jurisdiction_id === provinceId;
  if (user.role === "district") {
    const assigned = await districtRecord(user.jurisdiction_id);
    return Boolean(assigned && assigned.province_id === provinceId);
  }
  return false;
}

async function canAccessDistrict(user, districtId) {
  if (user.role === "admin" || user.role === "national") return true;
  if (user.role === "district") return user.jurisdiction_id === districtId;
  if (user.role === "province") {
    const district = await districtRecord(districtId);
    return Boolean(district && district.province_id === user.jurisdiction_id);
  }
  return false;
}

async function canAccessSubstation(user, substationId) {
  const substation = await Substation.findOne({ id: substationId }).lean();
  if (!substation) return { substation: null, allowed: false };
  return { substation, allowed: await canAccessDistrict(user, substation.district_id) };
}

async function canAccessInstallation(user, installationId) {
  const installation = await Installation.findOne({ id: installationId, deleted_at: null }).lean();
  if (!installation) return { installation: null, allowed: false };
  const { substation, allowed } = await canAccessSubstation(user, installation.substation_id);
  return { installation, substation, allowed };
}

async function requireProvince(user, id) {
  const province = await Province.findOne({ id }).lean();
  if (!province) fail(404, "RESOURCE_NOT_FOUND", "Province not found");
  if (!await canAccessProvince(user, id)) forbidden();
  return province;
}

async function requireDistrict(user, id) {
  const district = await District.findOne({ id }).lean();
  if (!district) fail(404, "RESOURCE_NOT_FOUND", "District not found");
  if (!await canAccessDistrict(user, id)) forbidden();
  return district;
}

async function requireSubstation(user, id) {
  const { substation, allowed } = await canAccessSubstation(user, id);
  if (!substation) fail(404, "RESOURCE_NOT_FOUND", "Substation not found");
  if (!allowed) forbidden();
  return substation;
}

async function requireInstallation(user, id) {
  const found = await Installation.findOne({ id }).lean();
  if (!found || found.deleted_at) fail(404, "RESOURCE_NOT_FOUND", "Solar installation not found");
  const { allowed } = await canAccessInstallation(user, id);
  if (!allowed) forbidden();
  return found;
}

async function listProvinces(user) {
  if (user.role === "admin" || user.role === "national") {
    return Province.find().sort({ id: 1 }).lean();
  }
  if (user.role === "province") {
    return Province.find({ id: user.jurisdiction_id }).sort({ id: 1 }).lean();
  }
  const assigned = await districtRecord(user.jurisdiction_id);
  if (!assigned) return [];
  return Province.find({ id: assigned.province_id }).sort({ id: 1 }).lean();
}

async function listDistricts(user, provinceId = null) {
  const filter = {};
  if (provinceId != null) filter.province_id = provinceId;
  if (user.role === "province") filter.province_id = user.jurisdiction_id;
  if (user.role === "district") filter.id = user.jurisdiction_id;
  return District.find(filter).sort({ id: 1 }).lean();
}

async function listSubstations(user, districtId = null) {
  let districts = await listDistricts(user);
  if (districtId != null) districts = districts.filter((row) => row.id === districtId);
  const ids = districts.map((row) => row.id);
  return Substation.find({ district_id: { $in: ids } }).sort({ id: 1 }).lean();
}

async function listInstallations(user, substationId = null) {
  const substations = await listSubstations(user);
  let ids = substations.map((row) => row.id);
  if (substationId != null) ids = ids.filter((value) => value === substationId);
  return Installation.find({ substation_id: { $in: ids }, deleted_at: null }).sort({ id: 1 }).lean();
}

module.exports = {
  forbidden,
  canAccessProvince,
  canAccessDistrict,
  requireProvince,
  requireDistrict,
  requireSubstation,
  requireInstallation,
  listProvinces,
  listDistricts,
  listSubstations,
  listInstallations
};

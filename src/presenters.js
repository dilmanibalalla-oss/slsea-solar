function pick(row, fields) {
  const out = {};
  for (const field of fields) out[field] = row[field] ?? null;
  return out;
}

function province(row) {
  return pick(row, ["id", "name", "code"]);
}

function district(row) {
  return pick(row, ["id", "name", "code", "province_id"]);
}

function substation(row) {
  return pick(row, ["id", "name", "capacity_mva", "district_id"]);
}

function installation(row) {
  return pick(row, [
    "id", "name", "meter_id", "inverter_id", "substation_id",
    "latitude", "longitude", "capacity_kw"
  ]);
}

function reading(row) {
  return {
    id: row.id,
    installation_id: row.installation_id,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
    power_kw: row.power_kw,
    cumulative_energy_kwh: row.cumulative_energy_kwh,
    voltage: row.voltage
  };
}

function userProfile(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    role: row.role,
    jurisdiction_id: row.jurisdiction_id ?? null
  };
}

module.exports = { province, district, substation, installation, reading, userProfile };

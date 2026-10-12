const { User, Province, District, Substation, Installation } = require("../src/models");
const { nextUnusedId } = require("../src/models/counter");
const { hashPassword } = require("../src/middleware/auth");

const ROLE_LABELS = {
  provincial: "province",
  provincial_analyst: "province",
  district_analyst: "district",
  national_analyst: "national"
};

function env(name, fallback) {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

function accountUsername(name) {
  return String(name).replace(/\s+province$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function accountLabel(name) {
  return String(name).replace(/\s+province$/i, "").trim();
}

async function migrateRoleLabels() {
  for (const [from, to] of Object.entries(ROLE_LABELS)) {
    await User.updateMany({ role: from }, { $set: { role: to } });
  }
}

async function defaultJurisdiction(role) {
  if (role === "province") {
    const western = await Province.findOne({ code: "WP" }).lean()
      || await Province.findOne().sort({ id: 1 }).lean();
    return western ? western.id : Number(env("ACCOUNT_PROVINCE_JURISDICTION_ID", null));
  }
  if (role === "district") {
    const colombo = await District.findOne({ name: "Colombo" }).lean()
      || await District.findOne().sort({ id: 1 }).lean();
    return colombo ? colombo.id : Number(env("ACCOUNT_DISTRICT_JURISDICTION_ID", null));
  }
  return null;
}

async function findExisting(spec, singleton) {
  if (spec.username) {
    const byUsername = await User.findOne({ username: spec.username }).select("+passwordHash");
    if (byUsername) return byUsername;
  }
  if (spec.email) {
    const byEmail = await User.findOne({ email: spec.email.toLowerCase() }).select("+passwordHash");
    if (byEmail) return byEmail;
  }
  if (singleton) {
    return User.findOne({ role: spec.role }).select("+passwordHash");
  }
  if (spec.jurisdiction_id != null) {
    return User.findOne({ role: spec.role, jurisdiction_id: spec.jurisdiction_id }).select("+passwordHash");
  }
  return null;
}

function compatible(existing, spec) {
  const roleOk = existing.role === spec.role || ROLE_LABELS[existing.role] === spec.role;
  if (!roleOk) return false;
  if (existing.jurisdiction_id != null && spec.jurisdiction_id != null
      && existing.jurisdiction_id !== spec.jurisdiction_id) {
    return false;
  }
  return true;
}

async function ensureUser(spec, { singleton = false } = {}) {
  const existing = await findExisting(spec, singleton);
  if (existing && !compatible(existing, spec)) {
    console.log(`Skipped ${spec.role} account ${spec.username}; ${existing.username || existing.email} is already a ${existing.role} account`);
    return existing;
  }
  if (existing) {
    const updates = {};
    if (existing.role !== spec.role && ROLE_LABELS[existing.role] === spec.role) {
      updates.role = spec.role;
    }
    if (!existing.username && spec.username) updates.username = spec.username;
    if (!existing.name && spec.name) updates.name = spec.name;
    if (!existing.email && spec.email) updates.email = spec.email.toLowerCase();
    if (existing.id == null) updates.id = await nextUnusedId("user", User);
    if (existing.jurisdiction_id == null && spec.jurisdiction_id != null) {
      updates.jurisdiction_id = spec.jurisdiction_id;
    }
    if (Object.keys(updates).length) {
      await User.updateOne({ _id: existing._id }, { $set: updates });
      console.log(`Preserved ${spec.role} account (${existing.username || existing.email}); updated profile fields only`);
    } else {
      console.log(`Preserved ${spec.role} account (${existing.username || existing.email}); password unchanged`);
    }
    return User.findById(existing._id).select("+passwordHash");
  }

  if (!spec.passwordHash && !spec.password) {
    throw new Error(
      `Missing password for new ${spec.role} account. Set ${spec.passwordEnv} (do not reuse another role's account).`
    );
  }
  const passwordHash = spec.passwordHash || await hashPassword(spec.password);
  const created = await User.create({
    id: await nextUnusedId("user", User),
    username: spec.username,
    name: spec.name,
    email: spec.email.toLowerCase(),
    passwordHash,
    role: spec.role,
    jurisdiction_id: spec.jurisdiction_id
  });
  if (spec.passwordHash) {
    console.log(`Created ${spec.role} account ${spec.username}; password copied from ${spec.passwordSource}`);
  } else {
    console.log(`Created ${spec.role} account ${spec.username}; password taken from ${spec.passwordEnv}`);
  }
  return created;
}

async function freeUsername(base, role, jurisdictionId) {
  const root = base || `${role}${jurisdictionId}`;
  const taken = await User.findOne({ username: root }).select("role jurisdiction_id").lean();
  if (!taken || (taken.role === role && taken.jurisdiction_id === jurisdictionId)) return root;
  const suffixed = `${root}${jurisdictionId}`;
  const again = await User.findOne({ username: suffixed }).select("role jurisdiction_id").lean();
  if (!again || (again.role === role && again.jurisdiction_id === jurisdictionId)) return suffixed;
  return `${role}${jurisdictionId}`;
}

async function ensureScopedAccounts(role, rows, exemplar) {
  for (const row of rows) {
    const assigned = await User.findOne({ role, jurisdiction_id: row.id }).select("_id").lean();
    if (assigned) continue;
    if (!exemplar || !exemplar.passwordHash) {
      throw new Error(`Missing ${role} password. The ${exemplar ? exemplar.username : role} account must exist before other ${role} accounts are created.`);
    }
    const username = await freeUsername(accountUsername(row.name), role, row.id);
    const label = accountLabel(row.name);
    await ensureUser({
      role,
      username,
      name: `${label} Analyst`,
      email: `${username}@slsea.example`,
      passwordHash: exemplar.passwordHash,
      passwordSource: exemplar.username,
      jurisdiction_id: row.id
    });
  }
}

async function ensureJurisdictionAccounts(role, exemplar) {
  const rows = role === "province"
    ? await Province.find().sort({ id: 1 }).lean()
    : await District.find().sort({ id: 1 }).lean();
  await ensureScopedAccounts(role, rows, exemplar);
}

async function anchorSubstation() {
  const colombo = await District.findOne({ name: "Colombo" }).lean();
  if (colombo) {
    const substation = await Substation.findOne({ district_id: colombo.id }).sort({ id: 1 }).lean();
    if (substation) return substation;
  }
  return Substation.findOne().sort({ id: 1 }).lean();
}

async function anchorInstallation(substation) {
  if (substation) {
    const onAnchor = await Installation.findOne({ substation_id: substation.id, deleted_at: null }).sort({ id: 1 }).lean();
    if (onAnchor) return onAnchor;
  }
  return Installation.findOne({ deleted_at: null }).sort({ id: 1 }).lean();
}

async function provisionResourceAccounts(role, anchor, passwordEnvName) {
  if (!anchor) return;
  const username = env(`ACCOUNT_${passwordEnvName}_USERNAME`, accountUsername(anchor.name));
  const requestedId = Number(env(`ACCOUNT_${passwordEnvName}_JURISDICTION_ID`, anchor.id));
  const Model = role === "substation" ? Substation : Installation;
  const record = Number.isFinite(requestedId)
    ? await Model.findOne({ id: requestedId }).lean() || anchor
    : anchor;
  await ensureUser({
    role,
    username,
    name: env(`ACCOUNT_${passwordEnvName}_NAME`, role === "substation" ? "Substation Analyst" : "Installation Analyst"),
    email: env(`ACCOUNT_${passwordEnvName}_EMAIL`, `${username}@slsea.example`),
    password: env(`ACCOUNT_${passwordEnvName}_PASSWORD`, process.env.SEED_ANALYST_PASSWORD),
    passwordEnv: `ACCOUNT_${passwordEnvName}_PASSWORD or SEED_ANALYST_PASSWORD`,
    jurisdiction_id: record.id
  });
  const exemplar = await User.findOne({ username }).select("+passwordHash")
    || await User.findOne({ role }).select("+passwordHash");
  const rows = role === "substation"
    ? await Substation.find().sort({ id: 1 }).lean()
    : await Installation.find({ deleted_at: null }).sort({ id: 1 }).lean();
  await ensureScopedAccounts(role, rows, exemplar);
}

async function provisionAccounts() {
  await migrateRoleLabels();
  const provinceId = Number(env("ACCOUNT_PROVINCE_JURISDICTION_ID", await defaultJurisdiction("province")));
  const districtId = Number(env("ACCOUNT_DISTRICT_JURISDICTION_ID", await defaultJurisdiction("district")));
  const provinceUsername = env("ACCOUNT_PROVINCE_USERNAME", "western");
  const districtUsername = env("ACCOUNT_DISTRICT_USERNAME", "colombo");
  await ensureUser({
    role: "admin",
    username: env("ACCOUNT_ADMIN_USERNAME", "admin"),
    name: env("ACCOUNT_ADMIN_NAME", "Administrator"),
    email: env("ACCOUNT_ADMIN_EMAIL", "admin@slsea.example"),
    password: env("ACCOUNT_ADMIN_PASSWORD", process.env.SEED_ADMIN_PASSWORD),
    passwordEnv: "ACCOUNT_ADMIN_PASSWORD or SEED_ADMIN_PASSWORD",
    jurisdiction_id: null
  }, { singleton: true });
  await ensureUser({
    role: "national",
    username: env("ACCOUNT_NATIONAL_USERNAME", "national"),
    name: env("ACCOUNT_NATIONAL_NAME", "National Analyst"),
    email: env("ACCOUNT_NATIONAL_EMAIL", "national@slsea.example"),
    password: env("ACCOUNT_NATIONAL_PASSWORD", process.env.SEED_ANALYST_PASSWORD),
    passwordEnv: "ACCOUNT_NATIONAL_PASSWORD or SEED_ANALYST_PASSWORD",
    jurisdiction_id: null
  }, { singleton: true });
  await ensureUser({
    role: "province",
    username: provinceUsername,
    name: env("ACCOUNT_PROVINCE_NAME", "Provincial Analyst"),
    email: env("ACCOUNT_PROVINCE_EMAIL", "western@slsea.example"),
    password: env("ACCOUNT_PROVINCE_PASSWORD", process.env.SEED_ANALYST_PASSWORD),
    passwordEnv: "ACCOUNT_PROVINCE_PASSWORD or SEED_ANALYST_PASSWORD",
    jurisdiction_id: Number.isFinite(provinceId) ? provinceId : null
  }, { singleton: true });
  await ensureUser({
    role: "district",
    username: districtUsername,
    name: env("ACCOUNT_DISTRICT_NAME", "District Analyst"),
    email: env("ACCOUNT_DISTRICT_EMAIL", "colombo@slsea.example"),
    password: env("ACCOUNT_DISTRICT_PASSWORD", process.env.SEED_ANALYST_PASSWORD),
    passwordEnv: "ACCOUNT_DISTRICT_PASSWORD or SEED_ANALYST_PASSWORD",
    jurisdiction_id: Number.isFinite(districtId) ? districtId : null
  }, { singleton: true });

  const provinceExemplar = await User.findOne({ username: provinceUsername }).select("+passwordHash")
    || await User.findOne({ role: "province" }).select("+passwordHash");
  const districtExemplar = await User.findOne({ username: districtUsername }).select("+passwordHash")
    || await User.findOne({ role: "district" }).select("+passwordHash");
  await ensureJurisdictionAccounts("province", provinceExemplar);
  await ensureJurisdictionAccounts("district", districtExemplar);

  const substationAnchor = await anchorSubstation();
  await provisionResourceAccounts("substation", substationAnchor, "SUBSTATION");
  await provisionResourceAccounts("installation", await anchorInstallation(substationAnchor), "INSTALLATION");
}

module.exports = { provisionAccounts, accountUsername };

if (require.main === module) {
  const path = require("node:path");
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  require("dotenv").config({ path: path.join(__dirname, "..", "src", ".env") });
  const mongoose = require("mongoose");
  const { connectDatabase } = require("../src/database");
  connectDatabase()
    .then(provisionAccounts)
    .catch((error) => {
      console.error("Account provisioning failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => { await mongoose.disconnect(); });
}

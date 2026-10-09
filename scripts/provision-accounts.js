const { User, Province, District } = require("../src/models");
const { nextId } = require("../src/models/counter");
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

async function ensureUser(spec) {
  const existing = await User.findOne({
    $or: [
      { role: spec.role },
      ...(spec.username ? [{ username: spec.username }] : []),
      ...(spec.email ? [{ email: spec.email.toLowerCase() }] : [])
    ]
  }).select("+passwordHash");

  if (existing) {
    const updates = {};
    if (existing.role !== spec.role && ROLE_LABELS[existing.role] === spec.role) {
      updates.role = spec.role;
    }
    if (!existing.username && spec.username) updates.username = spec.username;
    if (!existing.name && spec.name) updates.name = spec.name;
    if (!existing.email && spec.email) updates.email = spec.email.toLowerCase();
    if (existing.id == null) updates.id = await nextId("user");
    if (existing.jurisdiction_id == null && spec.jurisdiction_id != null) {
      updates.jurisdiction_id = spec.jurisdiction_id;
    }
    if (Object.keys(updates).length) {
      await User.updateOne({ _id: existing._id }, { $set: updates });
      console.log(`Preserved ${spec.role} account (${existing.username || existing.email}); updated profile fields only`);
    } else {
      console.log(`Preserved ${spec.role} account (${existing.username || existing.email}); password unchanged`);
    }
    return;
  }

  if (!spec.password) {
    throw new Error(
      `Missing password for new ${spec.role} account. Set ${spec.passwordEnv} (do not reuse another role's account).`
    );
  }
  const id = await nextId("user");
  await User.create({
    id,
    username: spec.username,
    name: spec.name,
    email: spec.email.toLowerCase(),
    passwordHash: await hashPassword(spec.password),
    role: spec.role,
    jurisdiction_id: spec.jurisdiction_id
  });
  console.log(`Created ${spec.role} account ${spec.username}; password taken from ${spec.passwordEnv}`);
}

async function provisionAccounts() {
  await migrateRoleLabels();
  const provinceId = Number(env("ACCOUNT_PROVINCE_JURISDICTION_ID", await defaultJurisdiction("province")));
  const districtId = Number(env("ACCOUNT_DISTRICT_JURISDICTION_ID", await defaultJurisdiction("district")));
  const specs = [
    {
      role: "admin",
      username: env("ACCOUNT_ADMIN_USERNAME", "admin"),
      name: env("ACCOUNT_ADMIN_NAME", "Administrator"),
      email: env("ACCOUNT_ADMIN_EMAIL", "admin@slsea.example"),
      password: env("ACCOUNT_ADMIN_PASSWORD", process.env.SEED_ADMIN_PASSWORD),
      passwordEnv: "ACCOUNT_ADMIN_PASSWORD or SEED_ADMIN_PASSWORD",
      jurisdiction_id: null
    },
    {
      role: "national",
      username: env("ACCOUNT_NATIONAL_USERNAME", "national"),
      name: env("ACCOUNT_NATIONAL_NAME", "National Analyst"),
      email: env("ACCOUNT_NATIONAL_EMAIL", "national@slsea.example"),
      password: env("ACCOUNT_NATIONAL_PASSWORD", process.env.SEED_ANALYST_PASSWORD),
      passwordEnv: "ACCOUNT_NATIONAL_PASSWORD or SEED_ANALYST_PASSWORD",
      jurisdiction_id: null
    },
    {
      role: "province",
      username: env("ACCOUNT_PROVINCE_USERNAME", "western"),
      name: env("ACCOUNT_PROVINCE_NAME", "Provincial Analyst"),
      email: env("ACCOUNT_PROVINCE_EMAIL", "western@slsea.example"),
      password: env("ACCOUNT_PROVINCE_PASSWORD", process.env.SEED_ANALYST_PASSWORD),
      passwordEnv: "ACCOUNT_PROVINCE_PASSWORD or SEED_ANALYST_PASSWORD",
      jurisdiction_id: Number.isFinite(provinceId) ? provinceId : null
    },
    {
      role: "district",
      username: env("ACCOUNT_DISTRICT_USERNAME", "colombo"),
      name: env("ACCOUNT_DISTRICT_NAME", "District Analyst"),
      email: env("ACCOUNT_DISTRICT_EMAIL", "colombo@slsea.example"),
      password: env("ACCOUNT_DISTRICT_PASSWORD", process.env.SEED_ANALYST_PASSWORD),
      passwordEnv: "ACCOUNT_DISTRICT_PASSWORD or SEED_ANALYST_PASSWORD",
      jurisdiction_id: Number.isFinite(districtId) ? districtId : null
    }
  ];
  for (const spec of specs) await ensureUser(spec);
}

module.exports = { provisionAccounts };

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

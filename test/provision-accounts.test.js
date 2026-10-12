const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "src", ".env") });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET) >= 32
  ? process.env.JWT_SECRET
  : "p".repeat(64);
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "solar-api";
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || "solar-clients";
{
  const source = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_api_provision_accounts_test";
  const parsed = new URL(source);
  parsed.pathname = "/solar_api_provision_accounts_test";
  process.env.MONGODB_URI = parsed.toString();
}
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://slsea-solar.vercel.app";

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { connectDatabase } = require("../src/database");
const { User, Province, District, Substation, Installation, Reading, LoginBucket } = require("../src/models");
const { Counter } = require("../src/models/counter");
const { verifyPassword } = require("../src/middleware/auth");
const { provisionAccounts } = require("../scripts/provision-accounts");

const provincePassword = "ProvinceSame@123456";
const districtPassword = "DistrictSame@123456";
const substationPassword = "SubstationSame@123";
const installationPassword = "InstallationSame@123";
const adminPassword = "AdminSame@1234567";
const nationalPassword = "NationalSame@12345";

function useAccountEnv() {
  process.env.ACCOUNT_ADMIN_USERNAME = "admin";
  process.env.ACCOUNT_ADMIN_PASSWORD = adminPassword;
  process.env.ACCOUNT_ADMIN_NAME = "Administrator";
  process.env.ACCOUNT_ADMIN_EMAIL = "admin@slsea.example";
  process.env.ACCOUNT_NATIONAL_USERNAME = "national";
  process.env.ACCOUNT_NATIONAL_PASSWORD = nationalPassword;
  process.env.ACCOUNT_NATIONAL_NAME = "National Analyst";
  process.env.ACCOUNT_NATIONAL_EMAIL = "national@slsea.example";
  process.env.ACCOUNT_PROVINCE_USERNAME = "western";
  process.env.ACCOUNT_PROVINCE_PASSWORD = provincePassword;
  process.env.ACCOUNT_PROVINCE_NAME = "Provincial Analyst";
  process.env.ACCOUNT_PROVINCE_EMAIL = "western@slsea.example";
  process.env.ACCOUNT_PROVINCE_JURISDICTION_ID = "";
  process.env.ACCOUNT_DISTRICT_USERNAME = "colombo";
  process.env.ACCOUNT_DISTRICT_PASSWORD = districtPassword;
  process.env.ACCOUNT_DISTRICT_NAME = "District Analyst";
  process.env.ACCOUNT_DISTRICT_EMAIL = "colombo@slsea.example";
  process.env.ACCOUNT_DISTRICT_JURISDICTION_ID = "";
  process.env.ACCOUNT_SUBSTATION_USERNAME = "";
  process.env.ACCOUNT_SUBSTATION_PASSWORD = substationPassword;
  process.env.ACCOUNT_SUBSTATION_NAME = "Substation Analyst";
  process.env.ACCOUNT_SUBSTATION_EMAIL = "";
  process.env.ACCOUNT_SUBSTATION_JURISDICTION_ID = "";
  process.env.ACCOUNT_INSTALLATION_USERNAME = "";
  process.env.ACCOUNT_INSTALLATION_PASSWORD = installationPassword;
  process.env.ACCOUNT_INSTALLATION_NAME = "Installation Analyst";
  process.env.ACCOUNT_INSTALLATION_EMAIL = "";
  process.env.ACCOUNT_INSTALLATION_JURISDICTION_ID = "";
  process.env.SEED_ADMIN_PASSWORD = adminPassword;
  process.env.SEED_ANALYST_PASSWORD = "DoNotUseAnalyst@123";
}

describe("province and district account provisioning", { concurrency: 1, timeout: 120000 }, () => {
  before(async () => {
    useAccountEnv();
    await connectDatabase();
    await Promise.all([
      User.deleteMany({}),
      Province.deleteMany({}),
      District.deleteMany({}),
      Substation.deleteMany({}),
      Installation.deleteMany({}),
      Reading.deleteMany({}),
      LoginBucket.deleteMany({}),
      Counter.deleteMany({})
    ]);
    await Province.create([
      { id: 1, name: "Western Province", code: "WP" },
      { id: 2, name: "North Western Province", code: "NWP" },
      { id: 3, name: "Central Province", code: "CP" }
    ]);
    await District.create([
      { id: 1, name: "Colombo", code: "CM", province_id: 1 },
      { id: 2, name: "Gampaha", code: "GM", province_id: 1 },
      { id: 3, name: "Kurunegala", code: "KG", province_id: 2 },
      { id: 4, name: "Puttalam", code: "PT", province_id: 2 },
      { id: 5, name: "Kandy", code: "KY", province_id: 3 }
    ]);
    await Substation.create([
      { id: 1, name: "Colombo Grid Substation", capacity_mva: 50, district_id: 1 },
      { id: 2, name: "Kurunegala Grid Substation", capacity_mva: 40, district_id: 3 }
    ]);
    await Installation.create([
      {
        id: 1, name: "Colombo Solar Site 1", meter_id: "MTR-1", inverter_id: "INV-1",
        substation_id: 1, latitude: 6.9, longitude: 79.8, capacity_kw: 5,
        api_key: "a".repeat(64), deleted_at: null
      },
      {
        id: 2, name: "Colombo Solar Site 2", meter_id: "MTR-2", inverter_id: "INV-2",
        substation_id: 1, latitude: 6.91, longitude: 79.81, capacity_kw: 6,
        api_key: "b".repeat(64), deleted_at: null
      },
      {
        id: 3, name: "Kurunegala Solar Site 1", meter_id: "MTR-3", inverter_id: "INV-3",
        substation_id: 2, latitude: 7.4, longitude: 80.3, capacity_kw: 4,
        api_key: "c".repeat(64), deleted_at: null
      }
    ]);
    await Reading.create([
      { id: 1, installation_id: 1, timestamp: new Date("2026-09-26T08:00:00.000Z"), power_kw: 1, cumulative_energy_kwh: 10, voltage: 230 },
      { id: 2, installation_id: 2, timestamp: new Date("2026-09-26T08:00:00.000Z"), power_kw: 2, cumulative_energy_kwh: 11, voltage: 230 },
      { id: 3, installation_id: 3, timestamp: new Date("2026-09-26T08:00:00.000Z"), power_kw: 3, cumulative_energy_kwh: 12, voltage: 231 }
    ]);
    await provisionAccounts();
  });

  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === "solar_api_provision_accounts_test") {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  test("creates one province login per province with the western password and jurisdiction", async () => {
    const western = await User.findOne({ username: "western" }).select("+passwordHash").lean();
    const northwestern = await User.findOne({ username: "northwestern" }).select("+passwordHash").lean();
    const central = await User.findOne({ username: "central" }).select("+passwordHash").lean();
    assert.equal(western.role, "province");
    assert.equal(western.jurisdiction_id, 1);
    assert.equal(western.name, "Provincial Analyst");
    assert.equal(northwestern.role, "province");
    assert.equal(northwestern.jurisdiction_id, 2);
    assert.equal(northwestern.email, "northwestern@slsea.example");
    assert.equal(central.role, "province");
    assert.equal(central.jurisdiction_id, 3);
    assert.equal(northwestern.passwordHash, western.passwordHash);
    assert.equal(central.passwordHash, western.passwordHash);
    assert.equal(await verifyPassword(provincePassword, northwestern.passwordHash), true);
    assert.equal(await verifyPassword(districtPassword, northwestern.passwordHash), false);
    assert.equal(await User.countDocuments({ role: "province" }), 3);
  });

  test("creates one district login per district with the colombo password and jurisdiction", async () => {
    const colombo = await User.findOne({ username: "colombo" }).select("+passwordHash").lean();
    const gampaha = await User.findOne({ username: "gampaha" }).select("+passwordHash").lean();
    const kurunegala = await User.findOne({ username: "kurunegala" }).select("+passwordHash").lean();
    const puttalam = await User.findOne({ username: "puttalam" }).select("+passwordHash").lean();
    const kandy = await User.findOne({ username: "kandy" }).select("+passwordHash").lean();
    assert.equal(colombo.role, "district");
    assert.equal(colombo.jurisdiction_id, 1);
    assert.equal(colombo.name, "District Analyst");
    for (const [user, jurisdictionId] of [[gampaha, 2], [kurunegala, 3], [puttalam, 4], [kandy, 5]]) {
      assert.equal(user.role, "district");
      assert.equal(user.jurisdiction_id, jurisdictionId);
      assert.equal(user.passwordHash, colombo.passwordHash);
    }
    assert.equal(await verifyPassword(districtPassword, kurunegala.passwordHash), true);
    assert.equal(await verifyPassword(provincePassword, kurunegala.passwordHash), false);
    assert.equal(await User.countDocuments({ role: "district" }), 5);
  });

  test("a second provision keeps passwords and does not add duplicate accounts", async () => {
    const beforeWestern = await User.findOne({ username: "western" }).select("+passwordHash").lean();
    const beforeNorth = await User.findOne({ username: "northwestern" }).select("+passwordHash").lean();
    const beforeColombo = await User.findOne({ username: "colombo" }).select("+passwordHash").lean();
    await provisionAccounts();
    const western = await User.findOne({ username: "western" }).select("+passwordHash").lean();
    const northwestern = await User.findOne({ username: "northwestern" }).select("+passwordHash").lean();
    const colombo = await User.findOne({ username: "colombo" }).select("+passwordHash").lean();
    assert.equal(western.passwordHash, beforeWestern.passwordHash);
    assert.equal(northwestern.passwordHash, beforeNorth.passwordHash);
    assert.equal(colombo.passwordHash, beforeColombo.passwordHash);
    assert.equal(await User.countDocuments({ role: "province" }), 3);
    assert.equal(await User.countDocuments({ role: "district" }), 5);
    assert.equal(await User.countDocuments({ role: "substation" }), 2);
    assert.equal(await User.countDocuments({ role: "installation" }), 3);
    assert.equal(await User.countDocuments({ username: "northwestern" }), 1);
    assert.equal(await User.countDocuments({ username: "admin" }), 1);
    assert.equal(await User.countDocuments({ username: "national" }), 1);
  });

  test("new province and district logins keep the same jurisdiction scope as western and colombo", async () => {
    const northLogin = await request(app)
      .post("/solar/v1/auth/login/provincial")
      .send({ username: "northwestern", password: provincePassword })
      .expect(200);
    assert.equal(northLogin.body.user.role, "province");
    assert.equal(northLogin.body.user.username, "northwestern");
    const northToken = { Authorization: `Bearer ${northLogin.body.access_token}` };
    const northProvinces = await request(app).get("/solar/v1/provinces").set(northToken).expect(200);
    assert.deepEqual(northProvinces.body.map((row) => row.code), ["NWP"]);
    const northDistricts = await request(app).get("/solar/v1/districts").set(northToken).expect(200);
    assert.deepEqual(northDistricts.body.map((row) => row.name).sort(), ["Kurunegala", "Puttalam"]);
    await request(app).get("/solar/v1/provinces/1").set(northToken).expect(403);

    const westLogin = await request(app)
      .post("/solar/v1/auth/login/provincial")
      .send({ username: "western", password: provincePassword })
      .expect(200);
    const westToken = { Authorization: `Bearer ${westLogin.body.access_token}` };
    const westProvinces = await request(app).get("/solar/v1/provinces").set(westToken).expect(200);
    assert.deepEqual(westProvinces.body.map((row) => row.code), ["WP"]);
    await request(app).get("/solar/v1/provinces/2").set(westToken).expect(403);

    const kuruLogin = await request(app)
      .post("/solar/v1/auth/login/district")
      .send({ username: "kurunegala", password: districtPassword })
      .expect(200);
    assert.equal(kuruLogin.body.user.role, "district");
    const kuruToken = { Authorization: `Bearer ${kuruLogin.body.access_token}` };
    const kuruDistricts = await request(app).get("/solar/v1/districts").set(kuruToken).expect(200);
    assert.deepEqual(kuruDistricts.body.map((row) => row.name), ["Kurunegala"]);
    await request(app).get("/solar/v1/districts/1").set(kuruToken).expect(403);

    const colomboLogin = await request(app)
      .post("/solar/v1/auth/login/district")
      .send({ username: "colombo", password: districtPassword })
      .expect(200);
    const colomboToken = { Authorization: `Bearer ${colomboLogin.body.access_token}` };
    const colomboDistricts = await request(app).get("/solar/v1/districts").set(colomboToken).expect(200);
    assert.deepEqual(colomboDistricts.body.map((row) => row.name), ["Colombo"]);
    await request(app).get("/solar/v1/districts/2").set(colomboToken).expect(403);

    const adminLogin = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "admin", password: adminPassword })
      .expect(200);
    const adminToken = { Authorization: `Bearer ${adminLogin.body.access_token}` };
    const allProvinces = await request(app).get("/solar/v1/provinces").set(adminToken).expect(200);
    assert.deepEqual(allProvinces.body.map((row) => row.code), ["WP", "NWP", "CP"]);
  });

  test("creates one substation and installation login with the exemplar password and jurisdiction", async () => {
    const colomboGrid = await User.findOne({ username: "colombogridsubstation" }).select("+passwordHash").lean();
    const kurunegalaGrid = await User.findOne({ username: "kurunegalagridsubstation" }).select("+passwordHash").lean();
    const site1 = await User.findOne({ username: "colombosolarsite1" }).select("+passwordHash").lean();
    const site2 = await User.findOne({ username: "colombosolarsite2" }).select("+passwordHash").lean();
    const kuruSite = await User.findOne({ username: "kurunegalasolarsite1" }).select("+passwordHash").lean();
    assert.equal(colomboGrid.role, "substation");
    assert.equal(colomboGrid.jurisdiction_id, 1);
    assert.equal(colomboGrid.name, "Substation Analyst");
    assert.equal(kurunegalaGrid.role, "substation");
    assert.equal(kurunegalaGrid.jurisdiction_id, 2);
    assert.equal(kurunegalaGrid.passwordHash, colomboGrid.passwordHash);
    assert.equal(site1.role, "installation");
    assert.equal(site1.jurisdiction_id, 1);
    assert.equal(site1.name, "Installation Analyst");
    assert.equal(site2.role, "installation");
    assert.equal(site2.jurisdiction_id, 2);
    assert.equal(kuruSite.jurisdiction_id, 3);
    assert.equal(site2.passwordHash, site1.passwordHash);
    assert.equal(kuruSite.passwordHash, site1.passwordHash);
    assert.equal(await verifyPassword(substationPassword, kurunegalaGrid.passwordHash), true);
    assert.equal(await verifyPassword(installationPassword, kuruSite.passwordHash), true);
    assert.equal(await verifyPassword(substationPassword, site1.passwordHash), false);
    assert.equal(await verifyPassword(districtPassword, colomboGrid.passwordHash), false);
    assert.equal(await User.countDocuments({ role: "substation" }), 2);
    assert.equal(await User.countDocuments({ role: "installation" }), 3);
  });

  test("substation, installation, and reading access follow the same territory rules as colombo and western", async () => {
    const gridLogin = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "kurunegalagridsubstation", password: substationPassword })
      .expect(200);
    assert.equal(gridLogin.body.user.role, "substation");
    const gridToken = { Authorization: `Bearer ${gridLogin.body.access_token}` };
    const gridSubstations = await request(app).get("/solar/v1/substations").set(gridToken).expect(200);
    assert.deepEqual(gridSubstations.body.map((row) => row.name), ["Kurunegala Grid Substation"]);
    const gridSites = await request(app).get("/solar/v1/installations").set(gridToken).expect(200);
    assert.deepEqual(gridSites.body.map((row) => row.name), ["Kurunegala Solar Site 1"]);
    const gridReadings = await request(app).get("/solar/v1/readings").set(gridToken).expect(200);
    assert.deepEqual(gridReadings.body.data.map((row) => row.installation_id), [3]);
    const gridDistricts = await request(app).get("/solar/v1/districts").set(gridToken).expect(200);
    assert.deepEqual(gridDistricts.body.map((row) => row.name), ["Kurunegala"]);
    const gridProvinces = await request(app).get("/solar/v1/provinces").set(gridToken).expect(200);
    assert.deepEqual(gridProvinces.body.map((row) => row.code), ["NWP"]);
    await request(app).get("/solar/v1/substations/1").set(gridToken).expect(403);
    await request(app).get("/solar/v1/installations/1/readings/1").set(gridToken).expect(403);
    await request(app).get("/solar/v1/provinces/1").set(gridToken).expect(403);

    const colomboGridLogin = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "colombogridsubstation", password: substationPassword })
      .expect(200);
    const colomboGridToken = { Authorization: `Bearer ${colomboGridLogin.body.access_token}` };
    const colomboSites = await request(app).get("/solar/v1/installations").set(colomboGridToken).expect(200);
    assert.deepEqual(colomboSites.body.map((row) => row.id), [1, 2]);
    await request(app).get("/solar/v1/substations/2").set(colomboGridToken).expect(403);

    const siteLogin = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "colombosolarsite2", password: installationPassword })
      .expect(200);
    assert.equal(siteLogin.body.user.role, "installation");
    const siteToken = { Authorization: `Bearer ${siteLogin.body.access_token}` };
    const ownSites = await request(app).get("/solar/v1/installations").set(siteToken).expect(200);
    assert.deepEqual(ownSites.body.map((row) => row.id), [2]);
    const ownReadings = await request(app).get("/solar/v1/readings").set(siteToken).expect(200);
    assert.deepEqual(ownReadings.body.data.map((row) => row.id), [2]);
    const ownHistory = await request(app).get("/solar/v1/installations/2/readings").set(siteToken).expect(200);
    assert.deepEqual(ownHistory.body.data.map((row) => row.id), [2]);
    const parentSubstation = await request(app).get("/solar/v1/substations").set(siteToken).expect(200);
    assert.deepEqual(parentSubstation.body.map((row) => row.id), [1]);
    const parentDistrict = await request(app).get("/solar/v1/districts").set(siteToken).expect(200);
    assert.deepEqual(parentDistrict.body.map((row) => row.name), ["Colombo"]);
    await request(app).get("/solar/v1/installations/1").set(siteToken).expect(403);
    await request(app).get("/solar/v1/installations/1/readings/1").set(siteToken).expect(403);
    await request(app).get("/solar/v1/substations/2").set(siteToken).expect(403);

    const westLogin = await request(app)
      .post("/solar/v1/auth/login/provincial")
      .send({ username: "western", password: provincePassword })
      .expect(200);
    const westToken = { Authorization: `Bearer ${westLogin.body.access_token}` };
    const westSubstations = await request(app).get("/solar/v1/substations").set(westToken).expect(200);
    assert.deepEqual(westSubstations.body.map((row) => row.id), [1]);
    const colomboLogin = await request(app)
      .post("/solar/v1/auth/login/district")
      .send({ username: "colombo", password: districtPassword })
      .expect(200);
    const colomboToken = { Authorization: `Bearer ${colomboLogin.body.access_token}` };
    const colomboReadings = await request(app).get("/solar/v1/readings").set(colomboToken).expect(200);
    assert.deepEqual(colomboReadings.body.data.map((row) => row.installation_id).sort(), [1, 2]);
  });
});

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "src", ".env") });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET) >= 32
  ? process.env.JWT_SECRET
  : "r".repeat(64);
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "solar-api";
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || "solar-clients";
{
  const source = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_api_resources_readings_test";
  const parsed = new URL(source);
  parsed.pathname = "/solar_api_resources_readings_test";
  process.env.MONGODB_URI = parsed.toString();
}
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://slsea-solar.vercel.app";

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { connectDatabase } = require("../src/database");
const { User, Province, District, Substation, Installation, Reading } = require("../src/models");
const { Counter } = require("../src/models/counter");
const { hashPassword, signUserToken } = require("../src/middleware/auth");

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

let adminToken;
let nationalToken;
let provinceToken;
let districtToken;
let apiKeyWest;
let apiKeySouth;

describe("substation reads, reading location, regional pagination", { concurrency: 1, timeout: 120000 }, () => {
  before(async () => {
    await connectDatabase();
    await Promise.all([
      User.deleteMany({}),
      Province.deleteMany({}),
      District.deleteMany({}),
      Substation.deleteMany({}),
      Installation.deleteMany({}),
      Reading.deleteMany({}),
      Counter.deleteMany({})
    ]);
    const passwordHash = await hashPassword("ResourcesTest@123456");
    await Province.create([
      { id: 1, name: "Western Province", code: "WP" },
      { id: 2, name: "Southern Province", code: "SP" }
    ]);
    await District.create([
      { id: 1, name: "Colombo", code: "CM", province_id: 1 },
      { id: 2, name: "Galle", code: "GL", province_id: 2 }
    ]);
    await Substation.create([
      { id: 1, name: "Colombo Grid", capacity_mva: 50, district_id: 1 },
      { id: 2, name: "Galle Grid", capacity_mva: 40, district_id: 2 }
    ]);
    apiKeyWest = "a".repeat(64);
    apiKeySouth = "b".repeat(64);
    await Installation.create([
      {
        id: 1, name: "West Site", meter_id: "SLMTR-W", inverter_id: "INV-W",
        substation_id: 1, latitude: 6.9, longitude: 79.8, capacity_kw: 8,
        api_key: apiKeyWest, deleted_at: null
      },
      {
        id: 2, name: "South Site", meter_id: "SLMTR-S", inverter_id: "INV-S",
        substation_id: 2, latitude: 6.0, longitude: 80.2, capacity_kw: 6,
        api_key: apiKeySouth, deleted_at: null
      }
    ]);
    await Reading.create([
      { id: 11, installation_id: 1, timestamp: new Date("2026-09-26T08:00:00.000Z"), power_kw: 1, cumulative_energy_kwh: 10, voltage: 230 },
      { id: 12, installation_id: 1, timestamp: new Date("2026-09-26T09:00:00.000Z"), power_kw: 2, cumulative_energy_kwh: 12, voltage: 230 },
      { id: 21, installation_id: 2, timestamp: new Date("2026-09-26T08:30:00.000Z"), power_kw: 3, cumulative_energy_kwh: 20, voltage: 231 }
    ]);
    await Counter.findByIdAndUpdate("reading", { $set: { seq: 100 } }, { upsert: true });
    await User.create([
      { id: 1, username: "res-admin", name: "Admin", email: "res-admin@example.test", passwordHash, role: "admin", jurisdiction_id: null },
      { id: 2, username: "res-national", name: "National", email: "res-national@example.test", passwordHash, role: "national", jurisdiction_id: null },
      { id: 3, username: "res-western", name: "Western", email: "res-western@example.test", passwordHash, role: "province", jurisdiction_id: 1 },
      { id: 4, username: "res-colombo", name: "Colombo", email: "res-colombo@example.test", passwordHash, role: "district", jurisdiction_id: 1 }
    ]);
    adminToken = signUserToken(await User.findOne({ id: 1 }).lean());
    nationalToken = signUserToken(await User.findOne({ id: 2 }).lean());
    provinceToken = signUserToken(await User.findOne({ id: 3 }).lean());
    districtToken = signUserToken(await User.findOne({ id: 4 }).lean());
  });

  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === "solar_api_resources_readings_test") {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  test("substation collection is filtered by role", async () => {
    const admin = await request(app).get("/solar/v1/substations").set(auth(adminToken)).expect(200);
    assert.equal(admin.body.length, 2);
    const national = await request(app).get("/solar/v1/substations").set(auth(nationalToken)).expect(200);
    assert.equal(national.body.length, 2);
    const province = await request(app).get("/solar/v1/substations").set(auth(provinceToken)).expect(200);
    assert.deepEqual(province.body.map((row) => row.id), [1]);
    const district = await request(app).get("/solar/v1/substations").set(auth(districtToken)).expect(200);
    assert.deepEqual(district.body.map((row) => row.id), [1]);
  });

  test("substation GET by id enforces 401 403 404", async () => {
    await request(app).get("/solar/v1/substations/1").expect(401);
    const ok = await request(app).get("/solar/v1/substations/1").set(auth(provinceToken)).expect(200);
    assert.equal(ok.body.name, "Colombo Grid");
    const forbidden = await request(app).get("/solar/v1/substations/2").set(auth(districtToken)).expect(403);
    assert.equal(forbidden.body.error.code, "FORBIDDEN");
    const missing = await request(app).get("/solar/v1/substations/99").set(auth(adminToken)).expect(404);
    assert.equal(missing.body.error.message, "Substation not found");
    await request(app).get("/solar/v1/substations/abc").set(auth(adminToken)).expect(400);
  });

  test("existing substation installations route still works", async () => {
    const response = await request(app)
      .get("/solar/v1/substations/1/installations")
      .set(auth(adminToken))
      .expect(200);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].id, 1);
    assert.equal(response.body[0].api_key, undefined);
  });

  test("POST reading Location identifies the created reading and GET follows it", async () => {
    const created = await request(app)
      .post("/solar/v1/installations/1/readings")
      .set("X-API-Key", apiKeyWest)
      .send({
        timestamp: "2026-09-26T10:00:00.000Z",
        power_kw: 2.5,
        cumulative_energy_kwh: 14,
        voltage: 230
      })
      .expect(201);
    const readingId = created.body.id;
    assert.match(
      created.headers.location,
      new RegExp(`/solar/v1/installations/1/readings/${readingId}$`)
    );
    const followed = await request(app)
      .get(`/solar/v1/installations/1/readings/${readingId}`)
      .set(auth(adminToken))
      .expect(200);
    assert.equal(followed.body.id, readingId);
    assert.equal(followed.body.installation_id, 1);
  });

  test("a reading cannot be retrieved under a different installation id", async () => {
    const response = await request(app)
      .get("/solar/v1/installations/2/readings/11")
      .set(auth(adminToken))
      .expect(404);
    assert.equal(response.body.error.message, "Reading not found");
  });

  test("latest and summary still reach their handlers", async () => {
    const latest = await request(app)
      .get("/solar/v1/installations/1/readings/latest")
      .set(auth(adminToken))
      .expect(200);
    assert.equal(latest.body.installation_id, 1);
    const summary = await request(app)
      .get("/solar/v1/installations/1/readings/summary")
      .set(auth(adminToken))
      .expect(200);
    assert.equal("summary" in summary.body, true);
  });

  test("regional filters return only matching permitted data", async () => {
    const west = await request(app)
      .get("/solar/v1/readings?province_id=1")
      .set(auth(adminToken))
      .expect(200);
    assert.ok(west.body.data.every((row) => row.installation_id === 1));
    const south = await request(app)
      .get("/solar/v1/readings?district_id=2")
      .set(auth(adminToken))
      .expect(200);
    assert.ok(south.body.data.every((row) => row.installation_id === 2));
    const sub = await request(app)
      .get("/solar/v1/readings?substation_id=1")
      .set(auth(adminToken))
      .expect(200);
    assert.ok(sub.body.data.every((row) => row.installation_id === 1));
    const clipped = await request(app)
      .get("/solar/v1/readings")
      .set(auth(provinceToken))
      .expect(200);
    assert.ok(clipped.body.data.every((row) => row.installation_id === 1));
    const denied = await request(app)
      .get("/solar/v1/readings?province_id=2")
      .set(auth(provinceToken))
      .expect(403);
    assert.equal(denied.body.error.code, "FORBIDDEN");
  });

  test("combining filters ANDs them and does not drop earlier restrictions", async () => {
    const ok = await request(app)
      .get("/solar/v1/readings?province_id=1&district_id=1&substation_id=1")
      .set(auth(adminToken))
      .expect(200);
    assert.ok(ok.body.data.every((row) => row.installation_id === 1));
    const inconsistent = await request(app)
      .get("/solar/v1/readings?province_id=1&district_id=2")
      .set(auth(adminToken))
      .expect(400);
    assert.equal(inconsistent.body.error.code, "VALIDATION_ERROR");
    assert.match(inconsistent.body.error.message, /district_id/);
  });

  test("pagination count is independent of page size and links retain filters", async () => {
    const all = await request(app)
      .get("/solar/v1/readings?province_id=1&sort=timestamp&order=asc&limit=1&page=1")
      .set(auth(adminToken))
      .expect(200);
    assert.ok(all.body.count >= 2);
    assert.equal(all.body.data.length, 1);
    assert.ok(all.body.next);
    assert.match(all.body.next, /province_id=1/);
    assert.match(all.body.next, /sort=timestamp/);
    assert.match(all.body.next, /order=asc/);
    assert.match(all.body.next, /limit=1/);
    assert.match(all.body.next, /page=2/);
    const page2 = await request(app)
      .get(all.body.next.replace(/^https?:\/\/[^/]+/, ""))
      .set(auth(adminToken))
      .expect(200);
    assert.equal(page2.body.count, all.body.count);
    assert.ok(page2.body.previous);
    assert.notEqual(page2.body.data[0].id, all.body.data[0].id);
  });

  test("timestamp sort asc and desc remain correct", async () => {
    const asc = await request(app)
      .get("/solar/v1/readings?province_id=1&sort=timestamp&order=asc")
      .set(auth(adminToken))
      .expect(200);
    const desc = await request(app)
      .get("/solar/v1/readings?province_id=1&sort=timestamp&order=desc")
      .set(auth(adminToken))
      .expect(200);
    const ascTimes = asc.body.data.map((row) => row.timestamp);
    const descTimes = desc.body.data.map((row) => row.timestamp);
    const sortedAsc = [...ascTimes].sort();
    assert.deepEqual(ascTimes, sortedAsc);
    assert.deepEqual(descTimes, [...sortedAsc].reverse());
    assert.equal(asc.body.summary, undefined);
  });

  test("GET reading uses installation jurisdiction and deleted-site 404", async () => {
    const denied = await request(app)
      .get("/solar/v1/installations/2/readings/21")
      .set(auth(districtToken))
      .expect(403);
    assert.equal(denied.body.error.code, "FORBIDDEN");
    await Installation.updateOne({ id: 1 }, { $set: { deleted_at: new Date() } });
    const gone = await request(app)
      .get("/solar/v1/installations/1/readings/11")
      .set(auth(adminToken))
      .expect(404);
    assert.equal(gone.body.error.message, "Solar installation not found");
    await Installation.updateOne({ id: 1 }, { $set: { deleted_at: null } });
  });
});

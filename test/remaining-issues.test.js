const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "src", ".env") });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET) >= 32
  ? process.env.JWT_SECRET
  : "k".repeat(64);
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "solar-api";
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || "solar-clients";
{
  const source = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_api_remaining_issues_test";
  const parsed = new URL(source);
  parsed.pathname = "/solar_api_remaining_issues_test";
  process.env.MONGODB_URI = parsed.toString();
}
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://slsea-solar.vercel.app";

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { connectDatabase } = require("../src/database");
const {
  User, Province, District, Substation, Installation, Reading, LoginBucket
} = require("../src/models");
const { Counter } = require("../src/models/counter");
const { hashPassword, signUserToken } = require("../src/middleware/auth");

const password = "RemainingIssues@123456";
const replaceBody = {
  name: "West Site Replaced",
  meter_id: "SLMTR-W",
  inverter_id: "INV-W",
  substation_id: 1,
  latitude: 6.9,
  longitude: 79.8,
  capacity_kw: 8
};

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

let adminToken;
let apiKeyWest;

describe("remaining contract issues", { concurrency: 1, timeout: 120000 }, () => {
  before(async () => {
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
    const passwordHash = await hashPassword(password);
    await Province.create({ id: 1, name: "Western Province", code: "WP" });
    await District.create({ id: 1, name: "Colombo", code: "CM", province_id: 1 });
    await Substation.create([
      { id: 1, name: "Colombo Grid", capacity_mva: 50, district_id: 1 },
      { id: 2, name: "Backup Grid", capacity_mva: 20, district_id: 1 }
    ]);
    apiKeyWest = "e".repeat(64);
    await Installation.create({
      id: 1, name: "West Site", meter_id: "SLMTR-W", inverter_id: "INV-W",
      substation_id: 1, latitude: 6.9, longitude: 79.8, capacity_kw: 8,
      api_key: apiKeyWest, deleted_at: null
    });
    await Installation.create({
      id: 2, name: "Empty Site", meter_id: "SLMTR-E", inverter_id: "INV-E",
      substation_id: 1, latitude: 6.91, longitude: 79.81, capacity_kw: 4,
      api_key: "f".repeat(64), deleted_at: null
    });
    await User.create({
      id: 1, username: "rem-admin", name: "Admin", email: "rem-admin@example.test",
      passwordHash, role: "admin", jurisdiction_id: null
    });
    adminToken = signUserToken(await User.findOne({ id: 1 }).lean());
  });

  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === "solar_api_remaining_issues_test") {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  test("PUT replacement requires a real parent substation and leaves the row unchanged on 404", async () => {
    const ok = await request(app)
      .put("/solar/v1/installations/1")
      .set(auth(adminToken))
      .send({ ...replaceBody, name: "West Site Replaced", substation_id: 2 })
      .expect(200);
    assert.equal(ok.body.name, "West Site Replaced");
    assert.equal(ok.body.substation_id, 2);

    const rejected = await request(app)
      .put("/solar/v1/installations/1")
      .set(auth(adminToken))
      .send({ ...replaceBody, name: "Should Not Persist", substation_id: 99999 })
      .expect(404);
    assert.equal(rejected.body.error.message, "Substation not found");

    const after = await request(app)
      .get("/solar/v1/installations/1")
      .set(auth(adminToken))
      .expect(200);
    assert.equal(after.body.name, "West Site Replaced");
    assert.equal(after.body.substation_id, 2);

    const incomplete = await request(app)
      .put("/solar/v1/installations/1")
      .set(auth(adminToken))
      .send({ name: "Partial" })
      .expect(400);
    assert.equal(incomplete.body.error.code, "VALIDATION_ERROR");
  });

  test("energy summary uses the full period and reports why it is unavailable", async () => {
    await Reading.deleteMany({ installation_id: { $in: [1, 2] } });
    const empty = await request(app)
      .get("/solar/v1/installations/2/readings/summary")
      .set(auth(adminToken))
      .expect(200);
    assert.equal(empty.body.summary, null);
    assert.equal(empty.body.summary_unavailable_reason, "insufficient_readings");

    await Reading.create([
      { id: 31, installation_id: 1, timestamp: new Date("2026-09-26T08:00:00.000Z"), power_kw: 1, cumulative_energy_kwh: 10, voltage: 230 },
      { id: 32, installation_id: 1, timestamp: new Date("2026-09-26T09:00:00.000Z"), power_kw: 2, cumulative_energy_kwh: 12, voltage: 230 },
      { id: 33, installation_id: 1, timestamp: new Date("2026-09-26T10:00:00.000Z"), power_kw: 2, cumulative_energy_kwh: 14, voltage: 230 }
    ]);
    const page = await request(app)
      .get("/solar/v1/installations/1/readings?limit=1&sort=timestamp&order=desc")
      .set(auth(adminToken))
      .expect(200);
    assert.equal(page.body.data.length, 1);
    assert.equal(page.body.summary.energyGeneratedKwh, 4);
    assert.equal(page.body.summary.readingCount, 3);
    assert.equal(page.body.summary_unavailable_reason, null);
    assert.ok(page.headers.etag);

    await Reading.create({
      id: 34, installation_id: 1, timestamp: new Date("2026-09-26T11:00:00.000Z"),
      power_kw: 1, cumulative_energy_kwh: 1, voltage: 230
    });
    await Reading.create({
      id: 35, installation_id: 1, timestamp: new Date("2026-09-26T12:00:00.000Z"),
      power_kw: 1, cumulative_energy_kwh: 3, voltage: 230
    });
    const reset = await request(app)
      .get("/solar/v1/installations/1/readings/summary")
      .set(auth(adminToken))
      .expect(200);
    assert.equal(reset.body.summary, null);
    assert.equal(reset.body.summary_unavailable_reason, "meter_reset");
  });

  test("login limiter returns 429 with Retry-After after isolated threshold overflow", async () => {
    await LoginBucket.deleteMany({});
    const first = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "nobody", password: "wrong-password" })
      .expect(401);
    assert.equal(first.body.error.code, "INVALID_CREDENTIALS");
    assert.equal(first.headers["retry-after"], undefined);
    await LoginBucket.updateMany({}, { $set: { count: 20 } });
    const limited = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "nobody", password: "wrong-password" })
      .expect(429);
    assert.equal(limited.body.error.code, "TOO_MANY_REQUESTS");
    assert.ok(Array.isArray(limited.body.error.details));
    const retryAfter = Number(limited.headers["retry-after"]);
    assert.equal(Number.isInteger(retryAfter) && retryAfter >= 1, true);
    await LoginBucket.deleteMany({});
  });
});

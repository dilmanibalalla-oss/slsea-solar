const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "src", ".env") });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET) >= 32
  ? process.env.JWT_SECRET
  : "d".repeat(64);
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "solar-api";
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || "solar-clients";
{
  const source = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_api_device_auth_test";
  const parsed = new URL(source);
  parsed.pathname = "/solar_api_device_auth_test";
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

const site = {
  name: "Device Auth Site",
  meter_id: "SLMTR-DEVICE-1",
  inverter_id: "INV-DEVICE-1",
  substation_id: 1,
  latitude: 6.9,
  longitude: 79.8,
  capacity_kw: 5
};

const readingBody = {
  timestamp: "2026-09-26T12:00:00.000Z",
  power_kw: 1.5,
  cumulative_energy_kwh: 20,
  voltage: 230
};

let adminToken;
let otherKey;

describe("device authentication", { concurrency: 1, timeout: 120000 }, () => {
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
    const passwordHash = await hashPassword("DeviceAuth@123456");
    await User.create({
      id: 1,
      username: "device-admin",
      name: "Admin",
      email: "device-admin@example.test",
      passwordHash,
      role: "admin",
      jurisdiction_id: null
    });
    await Province.create({ id: 1, name: "Western Province", code: "WP" });
    await District.create({ id: 1, name: "Colombo", code: "CM", province_id: 1 });
    await Substation.create({ id: 1, name: "Grid", capacity_mva: 10, district_id: 1 });
    otherKey = "f".repeat(64);
    await Installation.create({
      id: 1,
      name: "Existing Seed Site",
      meter_id: "SLMTR-EXISTING",
      inverter_id: "INV-EXISTING",
      substation_id: 1,
      latitude: 6.8,
      longitude: 79.7,
      capacity_kw: 4,
      api_key: otherKey,
      deleted_at: null
    });
    const admin = await User.findOne({ id: 1 }).lean();
    adminToken = signUserToken(admin);
  });

  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === "solar_api_device_auth_test") {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  test("returned key ingests a reading even when an older installation already occupies id 1", async () => {
    const created = await request(app)
      .post("/solar/v1/installations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(site)
      .expect(201);
    const id = created.body.installation.id;
    const apiKey = created.body.api_key;
    assert.equal(typeof id, "number");
    assert.notEqual(id, 1);
    assert.equal(typeof apiKey, "string");
    assert.equal(created.body.installation.api_key, undefined);

    const stored = await Installation.findOne({ id }).select("+api_key");
    assert.equal(typeof stored.get("api_key"), "string");
    assert.equal(stored.get("api_key").length, apiKey.length);

    const ingested = await request(app)
      .post(`/solar/v1/installations/${id}/readings`)
      .set("X-API-Key", apiKey)
      .send(readingBody)
      .expect(201);
    assert.equal(ingested.body.installation_id, id);
  });

  test("wrong key is rejected", async () => {
    const created = await request(app)
      .post("/solar/v1/installations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...site, meter_id: "SLMTR-DEVICE-2", inverter_id: "INV-DEVICE-2" })
      .expect(201);
    const response = await request(app)
      .post(`/solar/v1/installations/${created.body.installation.id}/readings`)
      .set("X-API-Key", otherKey)
      .send(readingBody)
      .expect(403);
    assert.equal(response.body.error.code, "FORBIDDEN");
  });

  test("same key used for another installation is rejected", async () => {
    const created = await request(app)
      .post("/solar/v1/installations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...site, meter_id: "SLMTR-DEVICE-3", inverter_id: "INV-DEVICE-3" })
      .expect(201);
    const response = await request(app)
      .post("/solar/v1/installations/1/readings")
      .set("X-API-Key", created.body.api_key)
      .send(readingBody)
      .expect(403);
    assert.equal(response.body.error.code, "FORBIDDEN");
  });

  test("deleted installation rejects ingestion", async () => {
    const created = await request(app)
      .post("/solar/v1/installations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...site, meter_id: "SLMTR-DEVICE-4", inverter_id: "INV-DEVICE-4" })
      .expect(201);
    const id = created.body.installation.id;
    await request(app)
      .delete(`/solar/v1/installations/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const response = await request(app)
      .post(`/solar/v1/installations/${id}/readings`)
      .set("X-API-Key", created.body.api_key)
      .send(readingBody)
      .expect(404);
    assert.equal(response.body.error.code, "RESOURCE_NOT_FOUND");
  });
});

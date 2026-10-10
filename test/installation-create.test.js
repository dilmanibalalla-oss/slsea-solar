process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "c".repeat(64);
process.env.JWT_ISSUER = "solar-api";
process.env.JWT_AUDIENCE = "solar-clients";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/solar_api_installation_create_test";
process.env.PUBLIC_API_URL = "https://slsea-solar.vercel.app";

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const config = require("../src/config");
const { connectDatabase } = require("../src/database");
const { User, Substation, Installation, Reading } = require("../src/models");
const { Counter } = require("../src/models/counter");
const { signUserToken } = require("../src/middleware/auth");

const site = {
  name: "Created Site",
  meter_id: "SLMTR-CREATE-1",
  inverter_id: "INV-CREATE-1",
  substation_id: 1,
  latitude: 6.9,
  longitude: 79.8,
  capacity_kw: 5
};

let adminToken;
let analystToken;
let adminWithoutWrite;

describe("POST /solar/v1/installations", { concurrency: 1 }, () => {
  before(async () => {
    await connectDatabase();
    await Promise.all([
      User.deleteMany({}),
      Substation.deleteMany({}),
      Installation.deleteMany({}),
      Reading.deleteMany({}),
      Counter.deleteMany({})
    ]);
    await User.create([
      {
        id: 1,
        username: "create-admin",
        name: "Admin",
        email: "create-admin@example.test",
        passwordHash: "unused",
        role: "admin",
        jurisdiction_id: null
      },
      {
        id: 2,
        username: "create-analyst",
        name: "Analyst",
        email: "create-analyst@example.test",
        passwordHash: "unused",
        role: "national",
        jurisdiction_id: null
      }
    ]);
    await Substation.create({ id: 1, name: "Test Substation", capacity_mva: 10, district_id: 1 });
    const admin = await User.findOne({ id: 1 }).lean();
    const analyst = await User.findOne({ id: 2 }).lean();
    adminToken = signUserToken(admin);
    analystToken = signUserToken(analyst);
    adminWithoutWrite = jwt.sign({
      sub: "1",
      kind: "user",
      scope: "analyst-read",
      role: "admin",
      jurisdiction_id: null
    }, config.jwtSecret, {
      algorithm: "HS256",
      expiresIn: "1h",
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    });
  });

  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === "solar_api_installation_create_test") {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  test("rejects installation creation without authentication", async () => {
    const response = await request(app)
      .post("/solar/v1/installations")
      .send(site)
      .expect(401);
    assert.equal(response.body.error.code, "UNAUTHENTICATED");
  });

  test("rejects an analyst", async () => {
    const response = await request(app)
      .post("/solar/v1/installations")
      .set("Authorization", `Bearer ${analystToken}`)
      .send(site)
      .expect(403);
    assert.equal(response.body.error.code, "FORBIDDEN");
  });

  test("rejects an administrator token without metadata-write", async () => {
    const response = await request(app)
      .post("/solar/v1/installations")
      .set("Authorization", `Bearer ${adminWithoutWrite}`)
      .send(site)
      .expect(403);
    assert.equal(response.body.error.code, "FORBIDDEN");
  });

  test("rejects a missing substation before creating an installation", async () => {
    const beforeCount = await Installation.countDocuments();
    const response = await request(app)
      .post("/solar/v1/installations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...site, meter_id: "SLMTR-MISSING-SUB", substation_id: 99999 })
      .expect(404);
    assert.equal(response.body.error.code, "RESOURCE_NOT_FOUND");
    assert.equal(response.body.error.message, "Substation not found");
    assert.equal(await Installation.countDocuments(), beforeCount);
  });

  test("creates an installation, returns the key once, and accepts it for readings", async () => {
    const created = await request(app)
      .post("/solar/v1/installations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(site)
      .expect(201);
    assert.equal(created.headers["cache-control"], "no-store");
    const id = created.body.installation.id;
    assert.match(created.headers.location, new RegExp(`/solar/v1/installations/${id}$`));
    assert.equal(created.body.installation.api_key, undefined);
    assert.equal(created.body.installation.name, site.name);
    assert.equal(created.body.installation.substation_id, 1);
    assert.match(created.body.api_key, /^[a-f0-9]{64}$/);

    const fetched = await request(app)
      .get(`/solar/v1/installations/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(fetched.body.api_key, undefined);
    assert.equal(JSON.stringify(fetched.body).includes(created.body.api_key), false);

    const listed = await request(app)
      .get("/solar/v1/installations")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(JSON.stringify(listed.body).includes(created.body.api_key), false);

    const reading = await request(app)
      .post(`/solar/v1/installations/${id}/readings`)
      .set("X-API-Key", created.body.api_key)
      .send({
        timestamp: "2026-09-26T09:00:00.000Z",
        power_kw: 1.2,
        cumulative_energy_kwh: 10,
        voltage: 230
      })
      .expect(201);
    assert.equal(reading.body.installation_id, id);
    assert.equal(reading.body.api_key, undefined);
  });
});

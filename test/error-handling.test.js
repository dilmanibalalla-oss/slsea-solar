const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "src", ".env") });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET) >= 32
  ? process.env.JWT_SECRET
  : "e".repeat(64);
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "solar-api";
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || "solar-clients";
{
  const source = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_api_error_handling_test";
  const parsed = new URL(source);
  parsed.pathname = "/solar_api_error_handling_test";
  process.env.MONGODB_URI = parsed.toString();
}
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://slsea-solar.vercel.app";

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const config = require("../src/config");
const { connectDatabase } = require("../src/database");
const { User, Province, District, Substation, Installation, Reading } = require("../src/models");
const { Counter } = require("../src/models/counter");
const { hashPassword, signUserToken } = require("../src/middleware/auth");
const { errorHandler } = require("../src/middleware/errors");

const password = "ErrorHandle@123456";
const siteBody = {
  name: "Error Site",
  meter_id: "SLMTR-ERR-1",
  inverter_id: "INV-ERR-1",
  substation_id: 1,
  latitude: 6.9,
  longitude: 79.8,
  capacity_kw: 5
};

let adminToken;
let provinceToken;
let districtToken;
let analystToken;
let apiKeyOne;
let apiKeyTwo;

function envelope(body) {
  assert.equal(typeof body.error, "object");
  assert.equal(typeof body.error.code, "string");
  assert.equal(typeof body.error.message, "string");
  assert.ok(Array.isArray(body.error.details));
  return body.error;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe("error handling", { concurrency: 1, timeout: 120000 }, () => {
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
    await Reading.syncIndexes();
    const passwordHash = await hashPassword(password);
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
    await User.create([
      { id: 1, username: "err-admin", name: "Admin", email: "err-admin@example.test", passwordHash, role: "admin", jurisdiction_id: null },
      { id: 2, username: "err-national", name: "National", email: "err-national@example.test", passwordHash, role: "national", jurisdiction_id: null },
      { id: 3, username: "err-western", name: "Western", email: "err-western@example.test", passwordHash, role: "province", jurisdiction_id: 1 },
      { id: 4, username: "err-colombo", name: "Colombo", email: "err-colombo@example.test", passwordHash, role: "district", jurisdiction_id: 1 }
    ]);
    apiKeyOne = "a".repeat(64);
    apiKeyTwo = "b".repeat(64);
    await Installation.create([
      {
        id: 1, name: "Site One", meter_id: "SLMTR-ERR-A", inverter_id: "INV-ERR-A",
        substation_id: 1, latitude: 6.9, longitude: 79.8, capacity_kw: 8, api_key: apiKeyOne, deleted_at: null
      },
      {
        id: 2, name: "Site Two", meter_id: "SLMTR-ERR-B", inverter_id: "INV-ERR-B",
        substation_id: 2, latitude: 6.0, longitude: 80.2, capacity_kw: 6, api_key: apiKeyTwo, deleted_at: null
      },
      {
        id: 3, name: "Empty Site", meter_id: "SLMTR-ERR-C", inverter_id: "INV-ERR-C",
        substation_id: 1, latitude: 6.91, longitude: 79.81, capacity_kw: 4, api_key: "c".repeat(64), deleted_at: null
      }
    ]);
    await Reading.create({
      id: 1, installation_id: 1, timestamp: new Date("2026-09-26T09:00:00.000Z"),
      power_kw: 1, cumulative_energy_kwh: 10, voltage: 230
    });
    await Counter.findByIdAndUpdate("reading", { $set: { seq: 100 } }, { upsert: true });
    await Counter.findByIdAndUpdate("installation", { $set: { seq: 100 } }, { upsert: true });
    const admin = await User.findOne({ id: 1 }).lean();
    const national = await User.findOne({ id: 2 }).lean();
    const western = await User.findOne({ id: 3 }).lean();
    const colombo = await User.findOne({ id: 4 }).lean();
    adminToken = signUserToken(admin);
    analystToken = signUserToken(national);
    provinceToken = signUserToken(western);
    districtToken = signUserToken(colombo);
  });

  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === "solar_api_error_handling_test") {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  test("wrong login credentials return 401 INVALID_CREDENTIALS", async () => {
    const response = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "err-admin", password: "wrong-password" })
      .expect(401);
    const error = envelope(response.body);
    assert.equal(error.code, "INVALID_CREDENTIALS");
    assert.equal(error.message, "Invalid credentials");
  });

  test("missing login fields return 400 with details", async () => {
    const response = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "err-admin" })
      .expect(400);
    const error = envelope(response.body);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.message, "Missing username or password");
    assert.ok(error.details.some((item) => item.path === "password"));
  });

  test("missing user JWT returns 401 with WWW-Authenticate", async () => {
    const response = await request(app).get("/solar/v1/provinces").expect(401);
    const error = envelope(response.body);
    assert.equal(error.code, "UNAUTHENTICATED");
    assert.equal(error.message, "Authorization Bearer token is required");
    assert.match(response.headers["www-authenticate"], /Bearer/);
  });

  test("invalid user JWT returns 401", async () => {
    const response = await request(app)
      .get("/solar/v1/provinces")
      .set(auth("not-a-jwt"))
      .expect(401);
    const error = envelope(response.body);
    assert.equal(error.code, "UNAUTHENTICATED");
    assert.equal(error.message, "Access token is invalid");
  });

  test("expired user JWT returns 401", async () => {
    const expired = jwt.sign({
      sub: "1",
      kind: "user",
      scope: "analyst-read metadata-write",
      role: "admin",
      jurisdiction_id: null
    }, config.jwtSecret, {
      algorithm: "HS256",
      expiresIn: -30,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    });
    const response = await request(app)
      .get("/solar/v1/provinces")
      .set(auth(expired))
      .expect(401);
    const error = envelope(response.body);
    assert.equal(error.code, "UNAUTHENTICATED");
    assert.equal(error.message, "Access token has expired");
  });

  test("provincial analyst cannot read another province", async () => {
    const response = await request(app)
      .get("/solar/v1/provinces/2")
      .set(auth(provinceToken))
      .expect(403);
    const error = envelope(response.body);
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.message, "Access denied: caller jurisdiction does not include this resource");
  });

  test("district analyst cannot read another district", async () => {
    const response = await request(app)
      .get("/solar/v1/districts/2")
      .set(auth(districtToken))
      .expect(403);
    const error = envelope(response.body);
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.message, "Access denied: caller jurisdiction does not include this resource");
  });

  test("analyst cannot write installation metadata", async () => {
    const response = await request(app)
      .put("/solar/v1/installations/1")
      .set(auth(analystToken))
      .send(siteBody)
      .expect(403);
    const error = envelope(response.body);
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.message, "Administrator metadata-write permission is required");
    assert.doesNotMatch(error.message, /jurisdiction/i);
  });

  test("invalid path id returns 400", async () => {
    const response = await request(app)
      .get("/solar/v1/provinces/abc")
      .set(auth(adminToken))
      .expect(400);
    const error = envelope(response.body);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.message, "id must be a positive integer");
  });

  test("invalid installation create body returns 400", async () => {
    const response = await request(app)
      .post("/solar/v1/installations")
      .set(auth(adminToken))
      .send({ name: "Only name" })
      .expect(400);
    const error = envelope(response.body);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.ok(error.details.length > 0);
  });

  test("incomplete PUT installation returns 400", async () => {
    const response = await request(app)
      .put("/solar/v1/installations/1")
      .set(auth(adminToken))
      .send({ name: "Partial" })
      .expect(400);
    const error = envelope(response.body);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.message, "Validation failed");
  });

  test("invalid pagination sort and reversed window return 400", async () => {
    const page = await request(app)
      .get("/solar/v1/installations/1/readings?page=0")
      .set(auth(adminToken))
      .expect(400);
    assert.equal(envelope(page.body).code, "VALIDATION_ERROR");

    const sort = await request(app)
      .get("/solar/v1/installations/1/readings?sort=not-a-field")
      .set(auth(adminToken))
      .expect(400);
    assert.equal(envelope(sort.body).code, "VALIDATION_ERROR");

    const window = await request(app)
      .get("/solar/v1/installations/1/readings?from=2026-09-27T00:00:00.000Z&to=2026-09-26T00:00:00.000Z")
      .set(auth(adminToken))
      .expect(400);
    const error = envelope(window.body);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.message, "from must be earlier than or equal to to");

    const badDate = await request(app)
      .get("/solar/v1/installations/1/readings?from=not-a-date")
      .set(auth(adminToken))
      .expect(400);
    assert.equal(envelope(badDate.body).code, "VALIDATION_ERROR");
  });

  test("missing resources return resource-specific 404", async () => {
    const province = await request(app).get("/solar/v1/provinces/99").set(auth(adminToken)).expect(404);
    assert.equal(envelope(province.body).message, "Province not found");
    const district = await request(app).get("/solar/v1/districts/99").set(auth(adminToken)).expect(404);
    assert.equal(envelope(district.body).message, "District not found");
    const installation = await request(app).get("/solar/v1/installations/99").set(auth(adminToken)).expect(404);
    assert.equal(envelope(installation.body).message, "Solar installation not found");
    const latest = await request(app).get("/solar/v1/installations/3/readings/latest").set(auth(adminToken)).expect(404);
    assert.equal(envelope(latest.body).message, "No readings found for this installation");
  });

  test("missing device credential returns 401", async () => {
    const response = await request(app)
      .post("/solar/v1/installations/1/readings")
      .send({ timestamp: "2026-09-26T10:00:00.000Z", power_kw: 1, cumulative_energy_kwh: 11, voltage: 230 })
      .expect(401);
    const error = envelope(response.body);
    assert.equal(error.code, "UNAUTHENTICATED");
    assert.equal(error.message, "X-API-Key header is required for device ingestion");
  });

  test("device credential for another installation returns 403", async () => {
    const response = await request(app)
      .post("/solar/v1/installations/1/readings")
      .set("X-API-Key", apiKeyTwo)
      .send({ timestamp: "2026-09-26T10:00:00.000Z", power_kw: 1, cumulative_energy_kwh: 11, voltage: 230 })
      .expect(403);
    const error = envelope(response.body);
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.message, "Provided API key does not match this installation");
  });

  test("duplicate reading returns 409", async () => {
    const payload = {
      timestamp: "2026-09-26T11:00:00.000Z",
      power_kw: 1.1,
      cumulative_energy_kwh: 12,
      voltage: 230
    };
    await request(app)
      .post("/solar/v1/installations/1/readings")
      .set("X-API-Key", apiKeyOne)
      .send(payload)
      .expect(201);
    const duplicate = await request(app)
      .post("/solar/v1/installations/1/readings")
      .set("X-API-Key", apiKeyOne)
      .send(payload)
      .expect(409);
    const error = envelope(duplicate.body);
    assert.equal(error.code, "DUPLICATE_RESOURCE");
    assert.equal(error.message, "A reading already exists for this installation at this timestamp");
  });

  test("unsupported Content-Type returns 415", async () => {
    const response = await request(app)
      .post("/solar/v1/auth/login")
      .set("Content-Type", "text/plain")
      .send("username=err-admin")
      .expect(415);
    const error = envelope(response.body);
    assert.equal(error.code, "UNSUPPORTED_MEDIA_TYPE");
  });

  test("unexpected internal errors return sanitized 500", async () => {
    const req = { requestId: "test-500", path: "/solar/v1/provinces" };
    const res = {
      headersSent: false,
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; }
    };
    errorHandler(new Error("mongodb://secret@localhost/hidden"), req, res, () => {});
    assert.equal(res.statusCode, 500);
    const error = envelope(res.body);
    assert.equal(error.code, "INTERNAL_ERROR");
    assert.equal(error.message, "An unexpected server error occurred");
    assert.doesNotMatch(JSON.stringify(res.body), /mongodb:\/\//);
    assert.doesNotMatch(JSON.stringify(res.body), /secret/);
  });

  test("valid authenticated reads still succeed", async () => {
    await request(app).get("/solar/v1/provinces/1").set(auth(provinceToken)).expect(200);
    await request(app).get("/solar/v1/districts/1").set(auth(districtToken)).expect(200);
    const ok = await request(app)
      .post("/solar/v1/auth/login")
      .send({ username: "err-admin", password })
      .expect(200);
    assert.equal(ok.body.token_type, "Bearer");
  });
});

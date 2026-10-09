process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a".repeat(64);
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_api_test";
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://slsea-solar.vercel.app";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const { apiServers, buildOpenApiDocument } = require("../src/docs/openapi");

test("swagger html has persistAuthorization set to false", async () => {
  const response = await request(app).get("/solar/v1/docs").expect(200);
  assert.match(response.text, /persistAuthorization:\s*false/);
  assert.match(response.text, /cdn\.jsdelivr\.net\/npm\/swagger-ui-dist@/);
  assert.match(response.text, /\/solar\/v1\/openapi\.json/);
  assert.doesNotMatch(response.text, /\/auth\/token/);
  assert.doesNotMatch(response.text, /X-User-Id/);
});

test("openapi json documents nested paths and JWT bearer auth", async () => {
  const response = await request(app).get("/solar/v1/openapi.json").expect(200);
  assert.equal(response.body.paths["/solar/v1/provinces/{id}/solar/v1/districts"] !== undefined, true);
  assert.equal(response.body.components.securitySchemes.UserAuth.bearerFormat, "JWT");
});

test("LoginPayload example is documentation-only and not a live secret field name TokenRequest", async () => {
  const spec = buildOpenApiDocument();
  assert.equal(spec.components.schemas.TokenRequest, undefined);
  const login = spec.components.schemas.LoginPayload;
  assert.equal(login.properties.username.example, "national_admin");
  assert.ok(login.required.includes("username"));
  assert.ok(login.required.includes("password"));
});

test("baseline inventory paths exist with integer path ids", () => {
  const spec = buildOpenApiDocument();
  const login = spec.paths["/solar/v1/auth/login"].post;
  assert.equal(login.security.length, 0);
  const history = spec.paths["/solar/v1/installations/{id}/solar/v1/readings"].get;
  assert.ok(history.parameters.some((p) => p.name === "id" && p.in === "path" && p.schema.type === "integer"));
  assert.ok(history.parameters.some((p) => p.name === "If-None-Match" && p.in === "header"));
  assert.ok(history.responses["200"].headers.ETag);
  assert.ok(history.responses["304"].headers.ETag);
  const ingest = spec.paths["/solar/v1/installations/{id}/solar/v1/readings"].post;
  assert.deepEqual(ingest.security, [{ ApiKeyAuth: [] }]);
  assert.ok(ingest.responses["201"].headers.Location);
});

test("apiServers includes localhost and the configured public origin", () => {
  const reqMock = {
    protocol: "https",
    get: (header) => (header === "host" ? "slsea-solar.vercel.app" : null)
  };
  const servers = apiServers(reqMock);
  assert.ok(servers.some((s) => s.url.includes("localhost")));
  assert.ok(servers.some((s) => s.url.includes("slsea-solar.vercel.app")));
});

test("authenticateUser rejects missing or invalid Bearer JWT with 401", async () => {
  const { authenticateUser } = require("../src/middleware/auth");
  const res = { set() {} };
  const missing = { get: () => null };
  await assert.rejects(
    async () => authenticateUser(missing, res, () => {}),
    (err) => err.status === 401 && err.message === "Invalid user identification"
  );
  const invalid = { get: (name) => (name === "Authorization" ? "Bearer not-a-jwt" : null) };
  await assert.rejects(
    async () => authenticateUser(invalid, res, () => {}),
    (err) => err.status === 401 && err.message === "Invalid user identification"
  );
});

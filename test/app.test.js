process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a".repeat(64);
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_api";
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://slsea-solar.vercel.app";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const { apiServers } = require("../src/docs/openapi");

test("root page reports a successful deployment", async () => {
  const response = await request(app).get("/").expect(200);
  assert.match(response.text, /Deployment successful/i);
  assert.match(response.text, /\/solar\/v1\/docs/);
});

test("status endpoint is documented for Swagger try-it-out", async () => {
  const response = await request(app).get("/solar/v1/status").expect(200);
  assert.equal(response.body.message, "Deployment successful");
  assert.match(response.body.docs, /\/solar\/v1\/docs$/);
});

test("swagger ui is served", async () => {
  const response = await request(app).get("/solar/v1/docs").expect(200);
  assert.match(response.text, /swagger-ui/);
});

test("openapi lists localhost and the deployed server", async () => {
  const response = await request(app).get("/solar/v1/openapi.json").expect(200);
  const urls = response.body.servers.map((server) => server.url);
  assert.ok(urls.some((url) => url.includes("localhost") && url.endsWith("/solar/v1")));
  assert.ok(urls.some((url) => url.includes("slsea-solar.vercel.app") && url.endsWith("/solar/v1")));
  assert.equal(response.body.paths["/status"].get.summary, "Confirm the API is deployed");
});

test("apiServers always includes local development", () => {
  const servers = apiServers();
  assert.equal(servers[0].description, "Local development");
});

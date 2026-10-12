process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "a".repeat(64);
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_api";
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://slsea-solar.vercel.app";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const { apiServers, buildOpenApiDocument } = require("../src/docs/openapi");

test("root page reports a successful deployment", async () => {
  const response = await request(app).get("/").expect(200);
  assert.match(response.text, /Deployment successful/i);
  assert.match(response.text, /\/solar\/v1\/docs/);
});

test("swagger ui is served", async () => {
  const response = await request(app).get("/solar/v1/docs").expect(200);
  assert.match(response.text, /swagger-ui/);
  assert.match(response.text, /cdn\.jsdelivr\.net\/npm\/swagger-ui-dist@/);
  assert.match(response.text, /SwaggerUIBundle/);
});

test("openapi lists localhost and the deployed origin", async () => {
  const response = await request(app).get("/solar/v1/openapi.json").expect(200);
  const urls = response.body.servers.map((server) => server.url);
  assert.ok(urls.some((url) => url.includes("localhost")));
  assert.ok(urls.some((url) => url.includes("slsea-solar.vercel.app")));
});

test("apiServers lists the hosted API before localhost", () => {
  const servers = apiServers();
  assert.equal(servers[0].description, "Hosted SLSEA API");
  assert.equal(servers[0].url, "https://slsea-solar.vercel.app");
  assert.ok(servers.some((server) => server.description === "Local SLSEA API"));
  assert.ok(servers.findIndex((server) => server.url.includes("localhost")) > 0);
});

test("localhost Swagger can call the API", async () => {
  const response = await request(app)
    .options("/solar/v1/auth/login")
    .set("Origin", "http://localhost:3000")
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "content-type,authorization")
    .expect(204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.match(response.headers["access-control-allow-headers"], /Authorization/);
  const docs = await request(app).get("/solar/v1/docs").expect(200);
  assert.match(docs.headers["content-security-policy"], /connect-src[^;]*https:\/\/slsea-solar\.vercel\.app/);
  assert.doesNotMatch(docs.headers["content-security-policy"], /upgrade-insecure-requests/);
  const other = await request(app).get("/solar/v1/openapi.json").set("Origin", "https://evil.example").expect(200);
  assert.equal(other.headers["access-control-allow-origin"], undefined);
});

test("openapi contract: tags, schemas, login, nested paths, security", () => {
  const spec = buildOpenApiDocument();
  assert.deepEqual(spec.tags.map((tag) => tag.name), [
    "Authentication", "Provinces", "Districts", "Substations",
    "Solar Installations", "Readings"
  ]);
  const schemaNames = Object.keys(spec.components.schemas);
  assert.deepEqual(schemaNames, [
    "Province", "District", "GridSubstation", "SolarInstallation",
    "GenerationReading", "CompositeInstallation", "DistrictSummary",
    "RegionalReadingsEnvelope", "ReadingsHistoryEnvelope", "CreateReadingPayload", "ErrorResponse",
    "LoginPayload", "LoginResponse"
  ]);
  assert.deepEqual(Object.keys(spec.components.schemas.Province.properties), ["id", "name", "code"]);
  assert.deepEqual(Object.keys(spec.components.schemas.District.properties), ["id", "name", "code", "province_id"]);
  assert.deepEqual(Object.keys(spec.components.schemas.GridSubstation.properties), ["id", "name", "capacity_mva", "district_id"]);
  assert.deepEqual(Object.keys(spec.components.schemas.SolarInstallation.properties), [
    "id", "name", "meter_id", "inverter_id", "substation_id", "latitude", "longitude", "capacity_kw"
  ]);
  assert.deepEqual(Object.keys(spec.components.schemas.LoginResponse.properties), [
    "access_token", "token_type", "message", "user"
  ]);
  assert.deepEqual(Object.keys(spec.components.schemas.LoginResponse.properties.user.properties), [
    "id", "username", "name", "email", "role"
  ]);
  assert.deepEqual(Object.keys(spec.components.schemas.ErrorResponse.properties.error.properties), [
    "code", "message", "details"
  ]);
  assert.deepEqual(spec.components.schemas.ErrorResponse.required, ["error"]);
  assert.equal(spec.paths["/solar/v1/auth/login"].post.responses["401"].content["application/json"].example.error.code, "INVALID_CREDENTIALS");
  assert.equal(spec.paths["/solar/v1/auth/login"].post.responses["429"].$ref, "#/components/responses/TooManyLogins");
  assert.equal(spec.paths["/solar/v1/installations/{id}"].put.responses["412"], undefined);
  assert.equal(spec.paths["/solar/v1/installations/{id}"].put.responses["428"], undefined);
  assert.equal(
    spec.paths["/solar/v1/installations/{id}"].put.responses["404"].content["application/json"].examples.missingSubstation.value.error.message,
    "Substation not found"
  );
  assert.equal(spec.components.schemas.LoginResponse.properties.user.properties.username.example, "admin");
  assert.equal(spec.components.schemas.LoginResponse.properties.user.properties.role.example, "admin");
  assert.deepEqual(spec.paths["/solar/v1/installations/{id}/readings"].get.parameters.find((p) => p.name === "limit").schema, {
    type: "integer", default: 50, minimum: 1, maximum: 200
  });
  assert.equal(spec.paths["/solar/v1/provinces/{id}"].get.responses["404"].content["application/json"].example.error.message, "Province not found");
  assert.equal(spec.paths["/solar/v1/districts/{id}"].get.responses["404"].content["application/json"].example.error.message, "District not found");
  assert.equal(spec.paths["/solar/v1/installations/{id}"].put.responses["401"].$ref, "#/components/responses/UnauthorizedBearer");
  assert.equal(spec.paths["/solar/v1/installations/{id}"].delete.responses["401"].$ref, "#/components/responses/UnauthorizedBearer");
  assert.equal(
    spec.paths["/solar/v1/installations/{id}/readings/latest"].get.responses["404"].content["application/json"].examples.noReadings.value.error.message,
    "No readings found for this installation"
  );
  assert.deepEqual(Object.keys(spec.paths), [
    "/solar/v1/auth/login",
    "/solar/v1/auth/login/national",
    "/solar/v1/auth/login/provincial",
    "/solar/v1/auth/login/district",
    "/solar/v1/provinces",
    "/solar/v1/provinces/{id}",
    "/solar/v1/provinces/{id}/districts",
    "/solar/v1/districts",
    "/solar/v1/districts/{id}",
    "/solar/v1/districts/{id}/substations",
    "/solar/v1/districts/{id}/summary",
    "/solar/v1/substations",
    "/solar/v1/substations/{id}",
    "/solar/v1/substations/{id}/installations",
    "/solar/v1/installations",
    "/solar/v1/installations/{id}",
    "/solar/v1/installations/{id}/readings/latest",
    "/solar/v1/installations/{id}/readings/summary",
    "/solar/v1/installations/{id}/readings/{readingId}",
    "/solar/v1/installations/{id}/readings",
    "/solar/v1/readings"
  ]);
  assert.deepEqual(Object.keys(spec.paths["/solar/v1/installations"]), ["get", "post"]);
  assert.equal(spec.paths["/solar/v1/installations"].post.responses["201"].content["application/json"].example.api_key, "YOUR_INSTALLATION_API_KEY");
  assert.equal(spec.paths["/solar/v1/installations"].post.responses["201"].content["application/json"].example.device_api_key, undefined);
  assert.equal(spec.components.securitySchemes.ApiKeyAuth.type, "apiKey");
  assert.equal(spec.components.securitySchemes.ApiKeyAuth.in, "header");
  assert.deepEqual(Object.keys(spec.paths["/solar/v1/installations/{id}"]), ["get", "put", "delete"]);
  assert.deepEqual(Object.keys(spec.paths["/solar/v1/provinces"]), ["get"]);
  assert.deepEqual(Object.keys(spec.components.securitySchemes), ["UserAuth", "ApiKeyAuth"]);
  assert.equal(spec.components.securitySchemes.UserAuth.type, "http");
  assert.equal(spec.components.securitySchemes.UserAuth.scheme, "bearer");
  assert.equal(spec.components.securitySchemes.UserAuth.bearerFormat, "JWT");
  assert.equal(spec.components.securitySchemes.ApiKeyAuth.name, "X-API-Key");
  assert.equal(spec.paths["/solar/v1/provinces"].post, undefined);
  assert.deepEqual(Object.keys(spec.paths["/solar/v1/substations"]), ["get"]);
  assert.deepEqual(Object.keys(spec.paths["/solar/v1/substations/{id}"]), ["get"]);
  assert.equal(spec.paths["/solar/v1/auth/login"].post.security.length, 0);
  assert.equal(spec.paths["/solar/v1/auth/login/national"].post.requestBody.content["application/json"].example.username, "national");
  assert.equal(spec.paths["/solar/v1/auth/login/provincial"].post.requestBody.content["application/json"].example.username, "western");
  assert.equal(spec.paths["/solar/v1/auth/login/district"].post.requestBody.content["application/json"].example.username, "colombo");
  assert.equal(spec.paths["/solar/v1/auth/login/substation"], undefined);
  assert.equal(spec.paths["/solar/v1/auth/login/installation"], undefined);
  assert.equal(spec.paths["/solar/v1/auth/login/national"].post.security.length, 0);
  assert.deepEqual(spec.paths["/solar/v1/installations/{id}/readings"].post.security, [{ ApiKeyAuth: [] }]);
  assert.equal(spec.paths["/docs"], undefined);
  assert.equal(spec.paths["/solar/v1/health"], undefined);
  assert.equal(spec.components.schemas.TokenRequest, undefined);
});

test("login schema requires username and password", () => {
  const { loginSchema } = require("../src/validators");
  assert.throws(() => loginSchema.parse({}));
});

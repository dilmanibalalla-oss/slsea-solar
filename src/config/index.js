const path = require("node:path");
const dotenv = require("dotenv");

const root = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });
if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: path.join(root, ".env.test") });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function ensureDatabaseName(uri, databaseName = "solar_api") {
  const parsed = new URL(uri);
  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = `/${databaseName}`;
  }
  return parsed.toString();
}

const jwtSecret = required("JWT_SECRET");
if (Buffer.byteLength(jwtSecret) < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}

const base = "/solar/v1";
const port = Number(process.env.PORT || 3000);
const publicOrigin = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");

module.exports = {
  base,
  port,
  mongoUri: ensureDatabaseName(required("MONGODB_URI")),
  jwtSecret,
  jwtIssuer: process.env.JWT_ISSUER || "solar-api",
  jwtAudience: process.env.JWT_AUDIENCE || "solar-clients",
  publicOrigin,
  localOrigin: `http://localhost:${port}`
};

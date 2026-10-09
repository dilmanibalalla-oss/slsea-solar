const {
  randomBytes, scrypt: scryptCallback, timingSafeEqual, createHmac
} = require("node:crypto");
const { promisify } = require("node:util");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { User, Installation, LoginBucket } = require("../models");
const { fail } = require("./errors");

const scrypt = promisify(scryptCallback);

function scopesForRole(role) {
  return role === "admin" ? "analyst-read metadata-write" : "analyst-read";
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, encoded] = stored.split(":");
  const expected = Buffer.from(encoded, "hex");
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signUserToken(user) {
  return jwt.sign({
    sub: String(user.id),
    kind: "user",
    scope: scopesForRole(user.role),
    role: user.role,
    jurisdiction_id: user.jurisdiction_id ?? null
  }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "1h",
    issuer: config.jwtIssuer,
    audience: config.jwtAudience
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerToken(req) {
  const header = req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : "";
}

async function authenticateUser(req, res, next) {
  const token = bearerToken(req);
  if (!token) fail(401, "UNAUTHENTICATED", "Invalid user identification");
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    });
  } catch {
    fail(401, "UNAUTHENTICATED", "Invalid user identification");
  }
  if (!payload || payload.kind !== "user" || payload.sub == null) {
    fail(401, "UNAUTHENTICATED", "Invalid user identification");
  }
  const userId = Number(payload.sub);
  const user = Number.isInteger(userId)
    ? await User.findOne({ id: userId }).lean()
    : null;
  if (!user) fail(401, "UNAUTHENTICATED", "Invalid user identification");
  const expectedScope = scopesForRole(user.role);
  const tokenScope = typeof payload.scope === "string" ? payload.scope : "";
  req.auth = {
    kind: "user",
    user,
    scopes: tokenScope.split(" ").filter(Boolean),
    expectedScope
  };
  next();
}

function requireReader(req, res, next) {
  if (!req.auth || req.auth.kind !== "user") {
    fail(401, "UNAUTHENTICATED", "Invalid user identification");
  }
  if (!req.auth.scopes.includes("analyst-read") || !req.auth.expectedScope.includes("analyst-read")) {
    fail(403, "FORBIDDEN", "Access denied: resource outside jurisdiction");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.kind !== "user") {
    fail(401, "UNAUTHENTICATED", "Invalid user identification");
  }
  if (req.auth.user.role !== "admin" ||
      !req.auth.scopes.includes("metadata-write") ||
      !req.auth.expectedScope.includes("metadata-write")) {
    fail(403, "FORBIDDEN", "Access denied: resource outside jurisdiction");
  }
  next();
}

async function authenticateApiKey(req, res, next) {
  const key = req.get("X-API-Key");
  if (!key) {
    fail(401, "UNAUTHENTICATED", "X-API-Key header is required for device ingestion");
  }
  const id = Number(req.params.id);
  const installation = await Installation.findOne({ id, deleted_at: null }).select("+api_key").lean();
  if (!installation) fail(404, "RESOURCE_NOT_FOUND", "Solar installation not found");
  if (!safeEqual(installation.api_key, key)) {
    fail(403, "FORBIDDEN", "Provided API key does not match this installation");
  }
  req.installation = installation;
  next();
}

async function loginThrottle(req, res, next) {
  const windowMs = 15 * 60 * 1000;
  const window = Math.floor(Date.now() / windowMs);
  const ipDigest = createHmac("sha256", config.jwtSecret)
    .update(req.ip || "unknown").digest("hex");
  const key = `${ipDigest}:${window}`;
  const expiresAt = new Date((window + 1) * windowMs);
  let bucket;
  try {
    bucket = await LoginBucket.findOneAndUpdate(
      { _id: key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true }
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    bucket = await LoginBucket.findOneAndUpdate(
      { _id: key }, { $inc: { count: 1 } }, { new: true }
    ).lean();
  }
  if (bucket.count > 20) {
    fail(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  signUserToken,
  scopesForRole,
  authenticateUser,
  requireReader,
  requireAdmin,
  authenticateApiKey,
  loginThrottle
};

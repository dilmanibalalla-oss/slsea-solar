const { randomBytes } = require("node:crypto");
const { User } = require("../models");
const { loginThrottle, verifyPassword, hashPassword, signUserToken } = require("../middleware/auth");
const { loginSchema, requireJson, noQuery } = require("../validators");
const { userProfile } = require("../presenters");
const { fail } = require("../middleware/errors");

let dummyHashPromise;

async function login(req, res) {
  noQuery(req);
  requireJson(req);
  const input = loginSchema.parse(req.body);
  const user = await User.findOne({ username: input.username }).select("+passwordHash").lean();
  if (!dummyHashPromise) dummyHashPromise = hashPassword(randomBytes(32).toString("hex"));
  const stored = user ? user.passwordHash : await dummyHashPromise;
  const valid = await verifyPassword(input.password, stored);
  if (!user || !valid) fail(401, "INVALID_CREDENTIALS", "Invalid credentials");
  const access_token = signUserToken(user);
  res.set("Cache-Control", "no-store");
  res.json({
    access_token,
    token_type: "Bearer",
    message: "Login successful",
    user: userProfile(user)
  });
}

module.exports = { loginThrottle, login };

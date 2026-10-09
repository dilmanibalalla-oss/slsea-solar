const { randomBytes } = require("node:crypto");
const { User } = require("../models");
const { loginThrottle, verifyPassword, hashPassword, signToken } = require("../middleware/auth");
const { loginSchema } = require("../validators");
const { fail } = require("../middleware/errors");
let dummyHashPromise;
async function issueToken(req, res) {
  const input = loginSchema.parse(req.body);
  const user = await User.findOne({ email: input.email }).select("+passwordHash").lean();
  if (!dummyHashPromise) dummyHashPromise = hashPassword(randomBytes(32).toString("hex"));
  const stored = user ? user.passwordHash : await dummyHashPromise;
  const valid = await verifyPassword(input.password, stored);
  if (!user || !valid) fail(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  const scope = user.role === "admin" ? "analyst-read metadata-write" : "analyst-read";
  const accessToken = signToken({ sub: String(user._id), kind: "user", scope });
  res.set("Cache-Control", "no-store");
  res.json({ accessToken, tokenType: "Bearer", expiresIn: 3600 });
}
module.exports = { loginThrottle, issueToken };

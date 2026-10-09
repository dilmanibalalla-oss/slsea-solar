const express = require("express");
const { loginThrottle, issueToken } = require("../controllers/auth");
const router = express.Router();
router.post("/auth/token", loginThrottle, issueToken);
module.exports = router;

const express = require("express");
const { loginThrottle, login } = require("../controllers/auth");
const router = express.Router();
router.post("/auth/login", loginThrottle, login);
module.exports = router;

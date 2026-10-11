const express = require("express");
const { loginThrottle, login } = require("../controllers/auth");
const router = express.Router();
router.post("/auth/login", loginThrottle, login);
router.post("/auth/login/national", loginThrottle, login);
router.post("/auth/login/provincial", loginThrottle, login);
router.post("/auth/login/district", loginThrottle, login);
module.exports = router;

const express = require("express");
const { authenticateUser, requireReader } = require("../middleware/auth");
const provinces = require("../controllers/provinces");
const router = express.Router();
router.get("/provinces", authenticateUser, requireReader, provinces.list);
router.get("/provinces/:id/solar/v1/districts", authenticateUser, requireReader, provinces.listDistricts);
router.get("/provinces/:id", authenticateUser, requireReader, provinces.getOne);
module.exports = router;

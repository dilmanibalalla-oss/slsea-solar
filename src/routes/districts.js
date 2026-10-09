const express = require("express");
const { authenticateUser, requireReader } = require("../middleware/auth");
const districts = require("../controllers/districts");
const router = express.Router();
router.get("/districts", authenticateUser, requireReader, districts.list);
router.get("/districts/:id/solar/v1/substations", authenticateUser, requireReader, districts.listSubstations);
router.get("/districts/:id/summary", authenticateUser, requireReader, districts.summary);
router.get("/districts/:id", authenticateUser, requireReader, districts.getOne);
module.exports = router;

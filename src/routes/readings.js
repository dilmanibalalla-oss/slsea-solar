const express = require("express");
const { authenticateUser, requireReader, authenticateApiKey } = require("../middleware/auth");
const readings = require("../controllers/readings");
const router = express.Router();
router.get(
  "/installations/:id/readings/latest",
  authenticateUser,
  requireReader,
  readings.latest
);
router.get(
  "/installations/:id/readings/summary",
  authenticateUser,
  requireReader,
  readings.period
);
router.get(
  "/installations/:id/readings",
  authenticateUser,
  requireReader,
  readings.history
);
router.post(
  "/installations/:id/readings",
  authenticateApiKey,
  readings.create
);
module.exports = router;

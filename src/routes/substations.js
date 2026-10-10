const express = require("express");
const { authenticateUser, requireReader } = require("../middleware/auth");
const substations = require("../controllers/substations");
const router = express.Router();
router.get("/substations/:id/installations", authenticateUser, requireReader, substations.listInstallations);
module.exports = router;

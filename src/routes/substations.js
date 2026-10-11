const express = require("express");
const { authenticateUser, requireReader } = require("../middleware/auth");
const substations = require("../controllers/substations");
const router = express.Router();
router.get("/substations", authenticateUser, requireReader, substations.list);
router.get("/substations/:id/installations", authenticateUser, requireReader, substations.listInstallations);
router.get("/substations/:id", authenticateUser, requireReader, substations.getOne);
module.exports = router;

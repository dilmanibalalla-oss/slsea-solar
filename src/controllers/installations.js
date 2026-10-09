const { Province, District, Substation, Reading } = require("../models");
const { noQuery, validateId } = require("../validators");
const { sendRepresentation } = require("../utils/http");
const { accessibleResource } = require("../services/scope");
const { fail } = require("../middleware/errors");
const { handlers } = require("./metadata");
async function composite(req, res) {
  noQuery(req);
  const id = validateId(req.params.id);
  const installation = await accessibleResource(req.auth, "installations", id);
  const substation = await Substation.findById(installation.substation).lean();
  const district = await District.findById(substation.district).lean();
  const province = await Province.findById(district.province).lean();
  const lastKnownReading = await Reading.findOne({ installation: id }).sort({ timestamp: -1, _id: -1 }).lean();
  sendRepresentation(req, res, { installation, substation, district, province, lastKnownReading });
}
async function lastKnownReading(req, res) {
  noQuery(req);
  const id = validateId(req.params.id);
  await accessibleResource(req.auth, "installations", id);
  const reading = await Reading.findOne({ installation: id }).sort({ timestamp: -1, _id: -1 }).lean();
  if (!reading) fail(404, "NO_READINGS", "Installation has no readings");
  sendRepresentation(req, res, reading);
}
module.exports = {
  ...handlers("installations"),
  composite,
  lastKnownReading
};

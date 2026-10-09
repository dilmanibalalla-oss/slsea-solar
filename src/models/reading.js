const mongoose = require("mongoose");
const { Schema, options, reference } = require("./schema");
const readingSchema = new Schema({
  installation: reference("Installation"),
  timestamp: { type: Date, required: true, immutable: true },
  powerKw: { type: Number, required: true, min: 0, immutable: true },
  cumulativeEnergyKwh: { type: Number, required: true, min: 0, immutable: true },
  voltage: { type: Number, required: true, min: 0, max: 500, immutable: true }
}, options);
readingSchema.index({ installation: 1, timestamp: 1 }, { unique: true });
readingSchema.index({ timestamp: -1, _id: -1 });
module.exports = mongoose.model("Reading", readingSchema);

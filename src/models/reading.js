const mongoose = require("mongoose");
const { Schema, options } = require("./schema");
const readingSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  installation_id: { type: Number, required: true, index: true },
  timestamp: { type: Date, required: true },
  power_kw: { type: Number, required: true },
  cumulative_energy_kwh: { type: Number, required: true },
  voltage: { type: Number, required: true }
}, options);
readingSchema.index({ installation_id: 1, timestamp: 1 }, { unique: true });
readingSchema.index({ installation_id: 1, timestamp: -1 });
module.exports = mongoose.model("Reading", readingSchema);

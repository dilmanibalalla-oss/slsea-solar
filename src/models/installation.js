const mongoose = require("mongoose");
const { Schema, options } = require("./schema");
const installationSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  meter_id: { type: String, required: true, trim: true, unique: true },
  inverter_id: { type: String, required: true, trim: true },
  substation_id: { type: Number, required: true, index: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  capacity_kw: { type: Number, required: true },
  api_key: { type: String, required: true, select: false },
  deleted_at: { type: Date, default: null, index: true }
}, options);
module.exports = mongoose.model("Installation", installationSchema);

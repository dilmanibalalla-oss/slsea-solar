const mongoose = require("mongoose");
const { Schema, options, reference } = require("./schema");
const installationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  meterId: { type: String, required: true, trim: true, unique: true },
  substation: reference("Substation"),
  capacityKw: { type: Number, required: true, min: 0.1, max: 10000 },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 }
}, options);
module.exports = mongoose.model("Installation", installationSchema);

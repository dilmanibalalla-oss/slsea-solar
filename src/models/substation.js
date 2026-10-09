const mongoose = require("mongoose");
const { Schema, options } = require("./schema");
const substationSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  capacity_mva: { type: Number, required: true },
  district_id: { type: Number, required: true, index: true }
}, options);
module.exports = mongoose.model("Substation", substationSchema);

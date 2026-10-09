const mongoose = require("mongoose");
const { Schema, options } = require("./schema");
const districtSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  province_id: { type: Number, required: true, index: true }
}, options);
districtSchema.index({ province_id: 1, name: 1 }, { unique: true });
module.exports = mongoose.model("District", districtSchema);

const mongoose = require("mongoose");
const { Schema, options } = require("./schema");
const provinceSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true }
}, options);
module.exports = mongoose.model("Province", provinceSchema);

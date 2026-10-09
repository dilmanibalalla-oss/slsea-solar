const mongoose = require("mongoose");
const { Schema, options } = require("./schema");
const provinceSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true }
}, options);
module.exports = mongoose.model("Province", provinceSchema);

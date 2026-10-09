const mongoose = require("mongoose");
const { Schema, options, reference } = require("./schema");
const substationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  district: reference("District")
}, options);
module.exports = mongoose.model("Substation", substationSchema);

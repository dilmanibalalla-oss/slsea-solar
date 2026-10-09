const mongoose = require("mongoose");
const { Schema, options, reference } = require("./schema");
const districtSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  province: reference("Province")
}, options);
districtSchema.index({ province: 1, name: 1 }, { unique: true });
module.exports = mongoose.model("District", districtSchema);

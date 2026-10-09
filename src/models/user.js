const mongoose = require("mongoose");
const { Schema, options } = require("./schema");
const userSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["admin", "national", "province", "district"], required: true },
  province: { type: Schema.Types.ObjectId, ref: "Province", default: null },
  district: { type: Schema.Types.ObjectId, ref: "District", default: null }
}, options);
module.exports = mongoose.model("User", userSchema);

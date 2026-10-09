const mongoose = require("mongoose");
const { Schema, options } = require("./schema");
const userSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  username: { type: String, required: true, trim: true, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["admin", "national", "province", "district"], required: true },
  jurisdiction_id: { type: Number, default: null }
}, options);
userSchema.index({ role: 1 });
module.exports = mongoose.model("User", userSchema);

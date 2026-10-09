const mongoose = require("mongoose");
const { Schema } = require("./schema");
// Infrastructure collection, not another business-domain entity.
const loginBucketSchema = new Schema({
  _id: String,
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true }
}, { versionKey: false });
loginBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("LoginBucket", loginBucketSchema);

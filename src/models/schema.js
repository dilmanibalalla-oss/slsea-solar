const { Schema } = require("mongoose");
const options = { timestamps: true, versionKey: "__v" };
const reference = (model) => ({
  type: Schema.Types.ObjectId, ref: model, required: true, index: true
});
module.exports = { Schema, options, reference };

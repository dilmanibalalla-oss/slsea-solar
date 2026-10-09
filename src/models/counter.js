const mongoose = require("mongoose");
const { Schema } = require("./schema");

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 }
}, { versionKey: false });

const Counter = mongoose.model("Counter", counterSchema);

async function nextId(name) {
  const row = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return row.seq;
}

async function nextIds(name, count) {
  if (count <= 0) return 1;
  const row = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: count } },
    { new: true, upsert: true }
  );
  return row.seq - count + 1;
}

module.exports = { Counter, nextId, nextIds };

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

async function nextUnusedId(name, model) {
  const last = await model.findOne().sort({ id: -1 }).select("id").lean();
  const maxExisting = last && Number.isFinite(last.id) ? last.id : 0;
  const incremented = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  if (incremented.seq > maxExisting) return incremented.seq;
  const jumped = await Counter.findByIdAndUpdate(
    name,
    { $max: { seq: maxExisting + 1 } },
    { new: true, upsert: true }
  );
  return jumped.seq;
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

module.exports = { Counter, nextId, nextIds, nextUnusedId };

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "src", ".env") });
const mongoose = require("mongoose");
const { connectDatabase } = require("../src/database");
const { Installation } = require("../src/models");

async function issue() {
  const id = Number(process.argv[2]);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Usage: npm run api-key -- <installation-id>");
  await connectDatabase();
  const installation = await Installation.findOne({ id, deleted_at: null }).select("+api_key").lean();
  if (!installation) throw new Error("Installation not found");
  console.log(installation.api_key);
}

issue().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => { await mongoose.disconnect(); });

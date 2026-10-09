const path = require("node:path");
const { randomBytes } = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "src", ".env") });
const mongoose = require("mongoose");
const { connectDatabase } = require("../src/database");
const models = require("../src/models");
const { nextIds } = require("../src/models/counter");
const { provisionAccounts } = require("./provision-accounts");
const { Province, District, Substation, Installation, Reading, LoginBucket, Counter } = models;

const geography = [
  ["Western", "WP", [["Colombo", "CM"], ["Gampaha", "GM"], ["Kalutara", "KT"]]],
  ["Central", "CP", [["Kandy", "KY"], ["Matale", "MT"], ["Nuwara Eliya", "NE"]]],
  ["Southern", "SP", [["Galle", "GL"], ["Matara", "MR"], ["Hambantota", "HB"]]],
  ["Northern", "NP", [["Jaffna", "JF"], ["Kilinochchi", "KL"], ["Mannar", "MN"], ["Vavuniya", "VV"], ["Mullaitivu", "ML"]]],
  ["Eastern", "EP", [["Batticaloa", "BT"], ["Ampara", "AP"], ["Trincomalee", "TC"]]],
  ["North Western", "NWP", [["Kurunegala", "KG"], ["Puttalam", "PT"]]],
  ["North Central", "NCP", [["Anuradhapura", "AD"], ["Polonnaruwa", "PL"]]],
  ["Uva", "UP", [["Badulla", "BD"], ["Monaragala", "MG"]]],
  ["Sabaragamuwa", "SGP", [["Ratnapura", "RT"], ["Kegalle", "KE"]]]
];

async function seed() {
  await connectDatabase();
  const database = mongoose.connection.name;
  if (process.env.SEED_CONFIRM !== database) {
    throw new Error(`Seed replaces geography and readings. Set SEED_CONFIRM=${database} explicitly. User accounts are not deleted.`);
  }
  async function resetCollection(model) {
    await model.deleteMany({});
    try { await model.collection.dropIndexes(); } catch { /* _id index remains or collection empty */ }
  }
  await resetCollection(Reading);
  await resetCollection(Installation);
  await resetCollection(Substation);
  await resetCollection(District);
  await resetCollection(Province);
  await LoginBucket.deleteMany({});
  await Counter.deleteMany({ _id: { $in: ["province", "district", "substation", "installation", "reading"] } });

  const installations = [];
  const provinces = [];
  const districts = [];
  let districtNumber = 0;
  let provinceId = await nextIds("province", geography.length);
  for (const [provinceName, provinceCode, districtRows] of geography) {
    const province = await Province.create({
      id: provinceId++,
      name: `${provinceName} Province`,
      code: provinceCode
    });
    provinces.push(province);
    let districtIdSeq;
    districtIdSeq = await nextIds("district", districtRows.length);
    for (const [districtName, districtCode] of districtRows) {
      districtNumber++;
      const district = await District.create({
        id: districtIdSeq++,
        name: districtName,
        code: districtCode,
        province_id: province.id
      });
      districts.push(district);
      const substationId = await nextIds("substation", 1);
      const substation = await Substation.create({
        id: substationId,
        name: `${districtName} Grid Substation`,
        capacity_mva: 100,
        district_id: district.id
      });
      const siteCount = 9;
      let installationId = await nextIds("installation", siteCount);
      for (let site = 1; site <= siteCount; site++) {
        const installation = await Installation.create({
          id: installationId++,
          name: `${districtName} Solar Site ${site}`,
          meter_id: `MTR-${districtNumber}-${String(site).padStart(3, "0")}`,
          inverter_id: `INV-${districtNumber}-${String(site).padStart(3, "0")}`,
          substation_id: substation.id,
          capacity_kw: 3 + site * 0.5,
          latitude: 6.0 + districtNumber * 0.12,
          longitude: 79.7 + (districtNumber % 10) * 0.12,
          api_key: randomBytes(32).toString("hex"),
          deleted_at: null
        });
        installations.push(installation);
      }
    }
  }
  const intervalMs = 15 * 60 * 1000;
  const points = 7 * 24 * 4;
  const end = Math.floor(Date.now() / intervalMs) * intervalMs;
  const start = end - (points - 1) * intervalMs;
  let total = 0;
  for (const [siteIndex, installation] of installations.entries()) {
    let cumulativeEnergy = 1000 + siteIndex * 20;
    const records = [];
    let readingId = await nextIds("reading", points);
    for (let point = 0; point < points; point++) {
      const timestamp = new Date(start + point * intervalMs);
      const local = new Date(timestamp.getTime() + 330 * 60 * 1000);
      const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
      const daylight = hour >= 6 && hour <= 18 ? Math.sin(Math.PI * (hour - 6) / 12) : 0;
      const variation = 0.75 + ((siteIndex * 13 + point * 7) % 20) / 100;
      const power_kw = Number((installation.capacity_kw * daylight * variation).toFixed(3));
      cumulativeEnergy += power_kw * 0.25;
      records.push({
        id: readingId++,
        installation_id: installation.id,
        timestamp,
        power_kw,
        cumulative_energy_kwh: Number(cumulativeEnergy.toFixed(4)),
        voltage: 228 + ((siteIndex + point) % 9)
      });
    }
    await Reading.insertMany(records);
    total += records.length;
    if ((siteIndex + 1) % 25 === 0) console.log(`Seeded ${siteIndex + 1} installations`);
  }

  await provisionAccounts();
  for (const model of Object.values(models)) {
    if (typeof model.createIndexes === "function") await model.createIndexes();
  }

  console.log({
    provinces: provinces.length,
    districts: districts.length,
    substations: await Substation.countDocuments(),
    installations: installations.length,
    readings: total
  });
  console.log("User accounts were preserved or created if missing. Passwords are never reset for existing users.");
  console.log("Print an installation API key with: npm run api-key -- 1");
}

seed().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
}).finally(async () => { await mongoose.disconnect(); });

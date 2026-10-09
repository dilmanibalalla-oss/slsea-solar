const { z } = require("zod");
const { fail } = require("../middleware/errors");

const integerId = z.coerce.number().int().positive();

function requireJson(req) {
  if (!req.is("application/json")) {
    fail(400, "VALIDATION_ERROR", "Content-Type: application/json is required");
  }
}

function parseId(value) {
  const parsed = integerId.safeParse(value);
  if (!parsed.success) fail(400, "VALIDATION_ERROR", "id must be an integer");
  return parsed.data;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
}).strict();

const provinceSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1)
}).strict();

const districtSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  province_id: integerId
}).strict();

const substationSchema = z.object({
  name: z.string().min(1),
  capacity_mva: z.number().finite(),
  district_id: integerId
}).strict();

const installationWriteSchema = z.object({
  name: z.string(),
  meter_id: z.string(),
  inverter_id: z.string(),
  substation_id: z.number().int(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  capacity_kw: z.number().finite()
}).strict();

const installationCreateSchema = installationWriteSchema;
const installationPatchSchema = installationWriteSchema.partial();

const readingSchema = z.object({
  timestamp: z.string(),
  power_kw: z.number().finite(),
  cumulative_energy_kwh: z.number().finite(),
  voltage: z.number().finite()
}).strict();

function historyQuery(req) {
  const schema = z.object({
    page: z.coerce.number().int().optional(),
    limit: z.coerce.number().int().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    sort: z.string().optional(),
    order: z.enum(["asc", "desc"]).optional()
  }).strict();
  const value = schema.parse(req.query);
  return {
    page: value.page ?? 1,
    limit: value.limit ?? 50,
    from: value.from,
    to: value.to,
    sort: value.sort ?? "timestamp",
    order: value.order ?? "desc"
  };
}

function noQuery(req) {
  if (Object.keys(req.query).length) {
    fail(400, "VALIDATION_ERROR", "This resource accepts no query parameters");
  }
}

module.exports = {
  requireJson,
  parseId,
  loginSchema,
  provinceSchema,
  districtSchema,
  substationSchema,
  installationCreateSchema,
  installationWriteSchema,
  installationPatchSchema,
  readingSchema,
  historyQuery,
  noQuery
};

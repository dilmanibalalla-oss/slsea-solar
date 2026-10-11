const { z } = require("zod");
const { fail } = require("../middleware/errors");

const integerId = z.coerce.number().int().positive();

function requireJson(req) {
  if (!req.is("application/json")) {
    fail(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type: application/json is required");
  }
}

function parseId(value) {
  const parsed = integerId.safeParse(value);
  if (!parsed.success) {
    fail(400, "VALIDATION_ERROR", "id must be a positive integer", [
      { path: "id", message: "id must be a positive integer" }
    ]);
  }
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
  substation_id: integerId,
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

const historySortFields = ["timestamp", "id", "power_kw", "cumulative_energy_kwh", "voltage"];

function assertTimeWindow(from, to) {
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (from && Number.isNaN(fromDate.getTime())) {
    fail(400, "VALIDATION_ERROR", "from must be a valid date-time", [
      { path: "from", message: "from must be a valid date-time" }
    ]);
  }
  if (to && Number.isNaN(toDate.getTime())) {
    fail(400, "VALIDATION_ERROR", "to must be a valid date-time", [
      { path: "to", message: "to must be a valid date-time" }
    ]);
  }
  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    fail(400, "VALIDATION_ERROR", "from must be earlier than or equal to to", [
      { path: "from", message: "from must be earlier than or equal to to" }
    ]);
  }
}

function pagingFromParsed(value) {
  assertTimeWindow(value.from, value.to);
  return {
    page: value.page ?? 1,
    limit: value.limit ?? 50,
    from: value.from,
    to: value.to,
    sort: value.sort ?? "timestamp",
    order: value.order ?? "desc"
  };
}

function historyQuery(req) {
  const schema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    sort: z.enum(historySortFields).optional(),
    order: z.enum(["asc", "desc"]).optional()
  }).strict();
  return pagingFromParsed(schema.parse(req.query));
}

function regionalReadingsQuery(req) {
  const schema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    sort: z.enum(historySortFields).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    province_id: integerId.optional(),
    district_id: integerId.optional(),
    substation_id: integerId.optional()
  }).strict();
  const value = schema.parse(req.query);
  return {
    ...pagingFromParsed(value),
    province_id: value.province_id,
    district_id: value.district_id,
    substation_id: value.substation_id
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
  regionalReadingsQuery,
  noQuery
};

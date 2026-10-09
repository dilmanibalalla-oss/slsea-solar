const errorExample = { error: { code: "RESOURCE_NOT_FOUND", message: "Province not found" } };
const errorContent = {
  "application/json": {
    schema: { $ref: "#/components/schemas/ErrorResponse" },
    example: errorExample
  }
};

const provinceExample = { id: 1, name: "Western Province", code: "WP" };
const districtExample = { id: 1, name: "Colombo", code: "CM", province_id: 1 };
const substationExample = {
  id: 1,
  name: "Colombo Central Grid Substation",
  capacity_mva: 100,
  district_id: 1
};
const installationExample = {
  id: 1,
  name: "Solar Installation 001",
  meter_id: "SLMTR-00001",
  inverter_id: "INV-00001",
  substation_id: 1,
  latitude: 6.939648,
  longitude: 79.818451,
  capacity_kw: 8
};
const readingAtEight = {
  id: 101,
  installation_id: 1,
  timestamp: "2026-09-26T08:00:00.000Z",
  power_kw: 3.7,
  cumulative_energy_kwh: 1250.5,
  voltage: 230
};
const readingExample = {
  id: 102,
  installation_id: 1,
  timestamp: "2026-09-26T09:00:00.000Z",
  power_kw: 3.7,
  cumulative_energy_kwh: 1254.2,
  voltage: 231
};
const compositeExample = { ...installationExample, last_reading: readingExample };
const summaryExample = {
  district_id: 1,
  district_name: "Colombo",
  total_installations: 10,
  current_power_kw: 0,
  total_energy_kwh: 4034.84,
  peak_power_kw: 13.61
};
const historyExample = {
  count: 2,
  next: null,
  previous: null,
  data: [readingAtEight, readingExample],
  summary: {
    energyGeneratedKwh: 3.7,
    averagePowerKw: 3.7,
    readingCount: 2
  }
};
const loginUserExample = {
  id: 1,
  username: "national_admin",
  name: "National Admin",
  email: "admin@slsea.gov.lk",
  role: "national",
  jurisdiction_id: null
};
const putInstallationExample = {
  name: "Solar Installation 001",
  meter_id: "SLMTR-00001",
  inverter_id: "INV-00001",
  substation_id: 1,
  latitude: 6.939648,
  longitude: 79.818451,
  capacity_kw: 8
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer" },
  description: "Integer public identifier (not a MongoDB ObjectId)"
};

function errorResponse(description) {
  return { description, content: errorContent };
}

function json(schema, example) {
  return {
    content: {
      "application/json": {
        schema,
        ...(example !== undefined ? { example } : {})
      }
    }
  };
}

function jsonBody(schema, example) {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
        ...(example !== undefined ? { example } : {})
      }
    }
  };
}

const installationInput = {
  type: "object",
  description: "Writable solar-site fields. api_key is never accepted or returned on this body.",
  properties: {
    name: { type: "string", description: "Display name of the solar site" },
    meter_id: { type: "string", description: "Utility meter identifier at the site" },
    inverter_id: { type: "string", description: "Inverter identifier at the site" },
    substation_id: { type: "integer", description: "Integer id of the parent grid substation" },
    latitude: { type: "number", description: "Site latitude in decimal degrees" },
    longitude: { type: "number", description: "Site longitude in decimal degrees" },
    capacity_kw: { type: "number", description: "Nameplate capacity in kilowatts" }
  }
};

const schemas = {
  Province: {
    type: "object",
    description: "Sri Lankan province in the SLSEA geography hierarchy.",
    properties: {
      id: { type: "integer", example: 1, description: "Public integer province id" },
      name: { type: "string", example: "Western Province", description: "Province display name" },
      code: { type: "string", example: "WP", description: "Short province code" }
    }
  },
  District: {
    type: "object",
    description: "Administrative district belonging to one province.",
    properties: {
      id: { type: "integer", example: 1, description: "Public integer district id" },
      name: { type: "string", example: "Colombo", description: "District display name" },
      code: { type: "string", example: "CM", description: "Short district code" },
      province_id: { type: "integer", example: 1, description: "Parent province integer id" }
    }
  },
  GridSubstation: {
    type: "object",
    description: "Grid substation that hosts solar installations in a district.",
    properties: {
      id: { type: "integer", example: 1, description: "Public integer substation id" },
      name: { type: "string", example: "Colombo Central Grid Substation", description: "Substation display name" },
      capacity_mva: { type: "number", example: 100, description: "Substation capacity in megavolt-amperes" },
      district_id: { type: "integer", example: 1, description: "Parent district integer id" }
    }
  },
  SolarInstallation: {
    type: "object",
    description: "Solar generation site. The device api_key is never included in this object.",
    properties: {
      id: { type: "integer", example: 1, description: "Public integer installation id" },
      name: { type: "string", example: "Solar Installation 001", description: "Site display name" },
      meter_id: { type: "string", example: "SLMTR-00001", description: "Utility meter identifier" },
      inverter_id: { type: "string", example: "INV-00001", description: "Inverter identifier" },
      substation_id: { type: "integer", example: 1, description: "Parent grid substation integer id" },
      latitude: { type: "number", example: 6.939648, description: "Site latitude in decimal degrees" },
      longitude: { type: "number", example: 79.818451, description: "Site longitude in decimal degrees" },
      capacity_kw: { type: "number", example: 8, description: "Nameplate capacity in kilowatts" }
    }
  },
  GenerationReading: {
    type: "object",
    description: "One stored meter reading for a solar site.",
    properties: {
      id: { type: "integer", example: 102, description: "Public integer reading id" },
      installation_id: { type: "integer", example: 1, description: "Installation this reading belongs to" },
      timestamp: { type: "string", format: "date-time", example: "2026-09-26T09:00:00.000Z", description: "Reading time in ISO-8601 UTC" },
      power_kw: { type: "number", example: 3.7, description: "Instantaneous power in kilowatts at this reading" },
      cumulative_energy_kwh: { type: "number", example: 1254.2, description: "Meter cumulative energy in kilowatt-hours" },
      voltage: { type: "number", example: 231, description: "Measured voltage" }
    }
  },
  CompositeInstallation: {
    type: "object",
    description: "Installation fields plus the newest generation reading for that site.",
    properties: {
      id: { type: "integer", example: 1, description: "Public integer installation id" },
      name: { type: "string", example: "Solar Installation 001", description: "Site display name" },
      meter_id: { type: "string", example: "SLMTR-00001", description: "Utility meter identifier" },
      inverter_id: { type: "string", example: "INV-00001", description: "Inverter identifier" },
      substation_id: { type: "integer", example: 1, description: "Parent grid substation integer id" },
      latitude: { type: "number", example: 6.939648, description: "Site latitude in decimal degrees" },
      longitude: { type: "number", example: 79.818451, description: "Site longitude in decimal degrees" },
      capacity_kw: { type: "number", example: 8, description: "Nameplate capacity in kilowatts" },
      last_reading: {
        nullable: true,
        allOf: [{ $ref: "#/components/schemas/GenerationReading" }],
        description: "Newest reading for the site, or null when none have been stored"
      }
    }
  },
  DistrictSummary: {
    type: "object",
    description: "Aggregated generation metrics for installations in one district.",
    properties: {
      district_id: { type: "integer", example: 1, description: "District integer id" },
      district_name: { type: "string", example: "Colombo", description: "District display name" },
      total_installations: { type: "integer", example: 10, description: "Active (not soft-deleted) installations in the district" },
      current_power_kw: { type: "number", example: 0, description: "Sum of each site's latest power_kw" },
      total_energy_kwh: { type: "number", example: 4034.84, description: "Sum of each site's latest cumulative_energy_kwh" },
      peak_power_kw: { type: "number", example: 13.61, description: "Maximum power_kw observed across those sites" }
    }
  },
  ReadingsHistoryEnvelope: {
    type: "object",
    description: "Paginated readings for one site, plus period energy from the cumulative kWh meter.",
    properties: {
      count: { type: "integer", example: 2, description: "Total readings matching the filter" },
      next: {
        type: "string",
        nullable: true,
        example: null,
        description: "Absolute URL of the next page, or null when there is none"
      },
      previous: {
        type: "string",
        nullable: true,
        example: null,
        description: "Absolute URL of the previous page, or null on the first page"
      },
      data: {
        type: "array",
        items: { $ref: "#/components/schemas/GenerationReading" },
        description: "Readings for this page"
      },
      summary: {
        type: "object",
        nullable: true,
        description: "Energy over the selected period from last minus first cumulative kWh. Null when fewer than two usable boundary readings exist or the meter reset in the window.",
        properties: {
          energyGeneratedKwh: { type: "number", example: 3.7, description: "Last cumulative_energy_kwh minus first, in kWh" },
          averagePowerKw: { type: "number", example: 3.7, description: "energyGeneratedKwh divided by elapsed hours" },
          readingCount: { type: "integer", example: 2, description: "Readings in the filtered period" }
        }
      }
    }
  },
  CreateReadingPayload: {
    type: "object",
    required: ["timestamp", "power_kw", "cumulative_energy_kwh", "voltage"],
    description: "Meter reading submitted by the installation device. No user JWT is accepted here.",
    properties: {
      timestamp: { type: "string", format: "date-time", example: "2026-09-26T09:00:00Z", description: "Reading time as an ISO-8601 date-time string" },
      power_kw: { type: "number", example: 3.7, description: "Instantaneous power in kilowatts" },
      cumulative_energy_kwh: { type: "number", example: 1254.2, description: "Meter cumulative energy in kilowatt-hours" },
      voltage: { type: "number", example: 231, description: "Measured voltage" }
    }
  },
  ErrorResponse: {
    type: "object",
    description: "JSON error envelope. The example below is the documented illustration; live `message` text depends on the failing operation.",
    properties: {
      error: {
        type: "object",
        properties: {
          code: { type: "string", example: "RESOURCE_NOT_FOUND", description: "Machine-readable error code" },
          message: { type: "string", example: "Province not found", description: "Human-readable explanation" }
        }
      }
    }
  },
  LoginPayload: {
    type: "object",
    required: ["username", "password"],
    description: "Existing account credentials. Do not send role or jurisdiction_id; those are read from the stored user.",
    properties: {
      username: { type: "string", example: "admin", description: "Existing account username. This example is documentation only." },
      password: { type: "string", format: "password", example: "8QGuahGnXIYCL03f", description: "Existing account password. This example is documentation only and is not a live credential." }
    }
  },
  LoginResponse: {
    type: "object",
    description: "Signed JWT plus the stored user profile. Passwords and hashes are never returned.",
    properties: {
      access_token: { type: "string", example: "<access_token>", description: "Signed JWT. Send as Authorization: Bearer <access_token> on user routes." },
      token_type: { type: "string", example: "Bearer", description: "Always Bearer for login-issued tokens" },
      message: { type: "string", example: "Login successful", description: "Login result message" },
      user: {
        type: "object",
        description: "Profile fields from the stored user record",
        properties: {
          id: { type: "integer", example: 1, description: "Public integer user id" },
          username: { type: "string", example: "national_admin", description: "Account username" },
          name: { type: "string", example: "National Admin", description: "Display name" },
          email: { type: "string", example: "admin@slsea.gov.lk", description: "Account email" },
          role: { type: "string", example: "national", description: "Stored role: admin, national, province, or district" },
          jurisdiction_id: { type: "integer", nullable: true, example: null, description: "Assigned province or district id; null for nationwide roles" }
        }
      }
    }
  }
};

function originFromRequest(req) {
  if (!req || !req.get) return null;
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  const host = req.get("x-forwarded-host") || req.get("host");
  return host ? `${proto}://${host}` : null;
}

function deployedOrigin() {
  const configured = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  if (configured) return configured.replace(/\/solar\/v1$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

function apiServers(req) {
  const port = process.env.PORT || 3000;
  const local = `http://localhost:${port}`;
  const servers = [{ url: local, description: "Local SLSEA API" }];
  const seen = new Set([local]);
  function add(url, description) {
    if (!url) return;
    const cleaned = url.replace(/\/$/, "").replace(/\/solar\/v1$/, "");
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    servers.push({ url: cleaned, description });
  }
  add(deployedOrigin(), "Hosted SLSEA API");
  const current = originFromRequest(req);
  if (current && !/localhost|127\.0\.0\.1/i.test(current)) add(current, "This deployment");
  return servers;
}

const buildSpecPaths = require("./spec-paths");

function specPaths() {
  return buildSpecPaths({
    errorResponse, json, jsonBody, idParam, installationInput,
    provinceExample, districtExample, substationExample, installationExample,
    readingExample, compositeExample, summaryExample, historyExample,
    loginUserExample, putInstallationExample
  });
}

function buildOpenApiDocument(req) {
  return {
    openapi: "3.0.3",
    info: {
      title: "SLSEA Solar Generation API",
      version: "1.0.0"
    },
    servers: apiServers(req),
    tags: [
      { name: "Authentication", description: "Obtain a JWT from an existing SLSEA account. Login itself is unauthenticated." },
      { name: "Provinces", description: "Province records and child districts, clipped to the signed-in user's territory." },
      { name: "Districts", description: "District records, substations in a district, and district-wide generation totals." },
      { name: "Substations", description: "Solar sites attached to one grid substation." },
      { name: "Solar Installations", description: "Solar sites: list, inspect with last reading, replace metadata, or soft-delete. api_key is never returned." },
      { name: "Readings", description: "Latest reading, paginated history with period energy, and device ingest via X-API-Key." }
    ],
    paths: specPaths(),
    components: {
      securitySchemes: {
        UserAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Paste the access_token from POST /solar/v1/auth/login. Swagger sends Authorization: Bearer <token>. Identity, role and jurisdiction are loaded from the stored user; callers cannot select them."
        },
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Installation-bound device key for POST /solar/v1/installations/{id}/solar/v1/readings only. Print a site key with `npm run api-key -- <installation-id>`. User JWTs are not accepted here."
        }
      },
      schemas
    },
    security: [{ UserAuth: [] }]
  };
}

module.exports = { buildOpenApiDocument, apiServers };

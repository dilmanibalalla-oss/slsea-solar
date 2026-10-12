function errorEnvelope(code, message, details = []) {
  return { error: { code, message, details } };
}

function errorResponse(description, body, extras = {}) {
  const { examples, headers } = extras;
  return {
    description,
    ...(headers ? { headers } : {}),
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
        ...(examples ? { examples } : { example: body })
      }
    }
  };
}

function refResponse(name) {
  return { $ref: `#/components/responses/${name}` };
}

const wwwAuthenticateBearer = {
  "WWW-Authenticate": {
    schema: { type: "string" },
    description: "Bearer challenge for user JWT failures",
    example: 'Bearer realm="solar-api"'
  }
};

const wwwAuthenticateApiKey = {
  "WWW-Authenticate": {
    schema: { type: "string" },
    description: "Challenge for missing X-API-Key on device ingest",
    example: 'ApiKey realm="solar-api"'
  }
};

const componentResponses = {
  UnauthorizedBearer: errorResponse(
    "Missing, invalid or expired Authorization Bearer JWT",
    errorEnvelope("UNAUTHENTICATED", "Authorization Bearer token is required"),
    {
      headers: wwwAuthenticateBearer,
      examples: {
        missing: {
          summary: "Missing Bearer token",
          value: errorEnvelope("UNAUTHENTICATED", "Authorization Bearer token is required")
        },
        invalid: {
          summary: "Invalid Bearer token",
          value: errorEnvelope("UNAUTHENTICATED", "Access token is invalid")
        },
        expired: {
          summary: "Expired Bearer token",
          value: errorEnvelope("UNAUTHENTICATED", "Access token has expired")
        }
      }
    }
  ),
  UnauthorizedApiKey: errorResponse(
    "X-API-Key header is missing. Device ingest does not accept a user JWT.",
    errorEnvelope("UNAUTHENTICATED", "X-API-Key header is required for device ingestion"),
    { headers: wwwAuthenticateApiKey }
  ),
  ForbiddenJurisdiction: errorResponse(
    "Authenticated caller is outside the resource jurisdiction",
    errorEnvelope("FORBIDDEN", "Access denied: caller jurisdiction does not include this resource")
  ),
  ForbiddenAdmin: errorResponse(
    "Authenticated caller lacks administrator metadata-write permission",
    errorEnvelope("FORBIDDEN", "Administrator metadata-write permission is required")
  ),
  ForbiddenApiKey: errorResponse(
    "X-API-Key does not match the installation in the path",
    errorEnvelope("FORBIDDEN", "Provided API key does not match this installation")
  ),
  ValidationFailed: errorResponse(
    "Request body or parameters failed validation",
    errorEnvelope("VALIDATION_ERROR", "Validation failed", [
      { path: "name", message: "Required" }
    ])
  ),
  ValidationPathId: errorResponse(
    "Path id is not a positive integer",
    errorEnvelope("VALIDATION_ERROR", "id must be a positive integer", [
      { path: "id", message: "id must be a positive integer" }
    ])
  ),
  ValidationQuery: errorResponse(
    "Query parameters failed validation",
    errorEnvelope("VALIDATION_ERROR", "from must be earlier than or equal to to", [
      { path: "from", message: "from must be earlier than or equal to to" }
    ])
  ),
  UnsupportedMediaType: errorResponse(
    "Content-Type must be application/json",
    errorEnvelope("UNSUPPORTED_MEDIA_TYPE", "Content-Type: application/json is required")
  ),
  DuplicateReading: errorResponse(
    "A reading already exists for this installation at this timestamp",
    errorEnvelope("DUPLICATE_RESOURCE", "A reading already exists for this installation at this timestamp")
  ),
  DuplicateMeterId: errorResponse(
    "meter_id is already used by another installation",
    errorEnvelope("DUPLICATE_RESOURCE", "An installation with this meter_id already exists")
  ),
  InconsistentGeography: errorResponse(
    "Geographic query filters do not nest (AND) consistently",
    errorEnvelope("VALIDATION_ERROR", "district_id is not in the requested province", [
      { path: "district_id", message: "district_id is not in the requested province" }
    ])
  ),
  TooManyLogins: errorResponse(
    "Login attempt threshold exceeded for this client in the current 15-minute window",
    errorEnvelope("TOO_MANY_REQUESTS", "Too many login attempts. Retry after the indicated window."),
    {
      headers: {
        "Retry-After": {
          schema: { type: "integer" },
          description: "Seconds remaining in the current 15-minute limiter window"
        }
      }
    }
  )
};

function notFound(message) {
  return errorResponse(message, errorEnvelope("RESOURCE_NOT_FOUND", message));
}

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
  data: [readingExample, readingAtEight],
  summary: {
    energyGeneratedKwh: 3.7,
    averagePowerKw: 3.7,
    readingCount: 2
  },
  summary_unavailable_reason: null
};
const loginUserExample = {
  id: 1,
  username: "admin",
  name: "National Administrator",
  email: "admin@slsea.example",
  role: "admin"
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
  description: "Writable solar-site fields. PUT requires every listed property. api_key is never accepted on this body.",
  required: ["name", "meter_id", "inverter_id", "substation_id", "latitude", "longitude", "capacity_kw"],
  properties: {
    name: { type: "string", description: "Display name of the solar site" },
    meter_id: { type: "string", description: "Utility meter identifier at the site" },
    inverter_id: { type: "string", description: "Inverter identifier at the site" },
    substation_id: { type: "integer", description: "Integer id of an existing parent grid substation" },
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
    description: "Aggregated generation metrics for active installations in one district. Sites with no stored readings are included in total_installations and contribute 0 to current_power_kw and total_energy_kwh. These figures are not limited to the current calendar day and have no freshness window.",
    properties: {
      district_id: { type: "integer", example: 1, description: "District integer id" },
      district_name: { type: "string", example: "Colombo", description: "District display name" },
      total_installations: { type: "integer", example: 10, description: "Active (not soft-deleted) installations in the district, including sites that have never submitted a reading" },
      current_power_kw: { type: "number", example: 0, description: "Sum of each site's latest-known power_kw. The sample can be hours or days old; it is not live instantaneous output. Sites with no readings contribute 0." },
      total_energy_kwh: { type: "number", example: 4034.84, description: "Sum of each site's latest cumulative_energy_kwh meter counter. This is lifetime-to-last-sample energy, not energy generated today." },
      peak_power_kw: { type: "number", example: 13.61, description: "Maximum power_kw among every stored reading for those installations, not only the latest sample per site. 0 when no readings exist." }
    }
  },
  RegionalReadingsEnvelope: {
    type: "object",
    description: "Paginated readings across permitted installations. This endpoint does not compute energy summary; use GET /installations/{id}/readings or /readings/summary for site period energy.",
    properties: {
      count: { type: "integer", example: 2, description: "Total matching readings before pagination" },
      next: {
        type: "string",
        nullable: true,
        example: null,
        description: "Absolute URL of the next page, preserving filters and sort"
      },
      previous: {
        type: "string",
        nullable: true,
        example: null,
        description: "Absolute URL of the previous page, preserving filters and sort"
      },
      data: {
        type: "array",
        items: { $ref: "#/components/schemas/GenerationReading" },
        description: "Readings for this page"
      }
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
        description: "Energy over the selected from/to period using every matching reading, independent of page size and sort. Last cumulative_energy_kwh minus first. Null when the period cannot be summarised.",
        properties: {
          energyGeneratedKwh: { type: "number", example: 3.7, description: "Last cumulative_energy_kwh minus first, in kWh" },
          averagePowerKw: { type: "number", example: 3.7, description: "energyGeneratedKwh divided by elapsed hours" },
          readingCount: { type: "integer", example: 2, description: "Readings in the filtered period, not the current page size" }
        }
      },
      summary_unavailable_reason: {
        type: "string",
        nullable: true,
        enum: ["insufficient_readings", "meter_reset"],
        description: "Null when summary is present. insufficient_readings when fewer than two usable chronological samples exist. meter_reset when cumulative_energy_kwh decreases in the period (including a later recovery)."
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
    required: ["error"],
    description: "JSON error envelope used by every error response. `details` is an array and is empty when there are no field-level issues.",
    properties: {
      error: {
        type: "object",
        required: ["code", "message", "details"],
        properties: {
          code: { type: "string", description: "Machine-readable error code" },
          message: { type: "string", description: "Human-readable explanation for this failure" },
          details: {
            type: "array",
            description: "Field-level validation issues when present. Always an array; empty on authentication, authorization, not-found, rate-limit and most conflict errors.",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "JSON body path, query name, or id" },
                message: { type: "string", description: "Issue for that path" }
              }
            }
          }
        }
      }
    }
  },
  LoginPayload: {
    type: "object",
    required: ["username", "password"],
    description: "Stored account username and password. Login verifies the password hash on the matching user record and issues a JWT. Role and jurisdiction_id are not accepted on this body. Provisioned usernames are admin, national, one province account per province, one district account per district, one substation account per substation, and one installation account per active solar installation. Province usernames are the province name in lowercase without spaces, such as western and northwestern. District usernames are the district name in lowercase without spaces, such as colombo and gampaha. Substation and installation accounts use POST /solar/v1/auth/login with the record name in lowercase without spaces. Readings have no separate login; a caller sees readings only for installations inside their jurisdiction.",
    properties: {
      username: { type: "string", example: "admin", description: "Existing account username. Demo Try-it-out usernames include admin, national, western and colombo. Other provinces and districts follow the same lowercase name pattern." },
      password: { type: "string", format: "password", example: "8QGuahGnXIYCL03f", description: "Password for the username. The admin login example is the provisioned demo account; other schema copies are not additional live secrets." }
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
          username: { type: "string", example: "admin", description: "Account username matching the login example" },
          name: { type: "string", example: "National Administrator", description: "Display name" },
          email: { type: "string", example: "admin@slsea.example", description: "Account email" },
          role: { type: "string", example: "admin", description: "Stored role: admin, national, province, district, substation, or installation" }
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
  return "https://slsea-solar.vercel.app";
}

function apiServers(req) {
  const port = process.env.PORT || 3000;
  const local = `http://localhost:${port}`;
  const servers = [];
  const seen = new Set();
  function add(url, description) {
    if (!url) return;
    const cleaned = url.replace(/\/$/, "").replace(/\/solar\/v1$/, "");
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    servers.push({ url: cleaned, description });
  }
  const current = originFromRequest(req);
  add(deployedOrigin(), "Hosted SLSEA API");
  if (current && !/localhost|127\.0\.0\.1/i.test(current)) {
    add(current, "This deployment");
  }
  add(local, "Local SLSEA API");
  return servers;
}

const buildSpecPaths = require("./spec-paths");

function specPaths() {
  return buildSpecPaths({
    errorResponse, refResponse, errorEnvelope, notFound, json, jsonBody, idParam, installationInput,
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
      { name: "Authentication", description: "Obtain a JWT from an existing SLSEA account. Login itself is unauthenticated. The password is the same for every province account and the same for every district account. Only the username changes: use the province or district name in lowercase letters with spaces removed, such as western, northwestern, colombo, and gampaha." },
      { name: "Provinces", description: "Province records and child districts, clipped to the signed-in user's territory." },
      { name: "Districts", description: "District records, substations in a district, and district-wide generation totals." },
      { name: "Substations", description: "Grid substations the caller may see, plus solar sites attached to one substation. A substation account is limited to its assigned substation, the same way a district account is limited to its district." },
      { name: "Solar Installations", description: "Solar sites: list, inspect with last reading, create, replace metadata, or soft-delete. The device api_key is returned only by the create response. An installation account is limited to its assigned site." },
      { name: "Readings", description: "Latest reading, one-reading GET, paginated site history with period energy, regional listing without energy summary, and device ingest via X-API-Key. Reading visibility follows the caller jurisdiction: province, district, substation, or installation." }
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
          description: "Installation-specific API key returned once by POST /solar/v1/installations. Paste that existing api_key here with no quotes and no Bearer prefix. Swagger stores this value and sends it as the X-API-Key header on endpoints that require device authentication. The key authorizes reading submissions only for its associated active installation. Human Bearer tokens are a separate Authorize scheme and cannot be used here."
        }
      },
      responses: componentResponses,
      schemas
    },
    security: [{ UserAuth: [] }]
  };
}

module.exports = { buildOpenApiDocument, apiServers };

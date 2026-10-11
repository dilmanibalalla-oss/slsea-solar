module.exports = function specPaths({
  errorResponse, refResponse, errorEnvelope, notFound, json, jsonBody, idParam, installationInput,
  provinceExample, districtExample, substationExample, installationExample,
  readingExample, compositeExample, summaryExample, historyExample,
  loginUserExample, putInstallationExample
}) {
  const analystPassword = "zIjHj67gY1cyFTYT";
  const auth401 = refResponse("UnauthorizedBearer");
  const apiKey401 = refResponse("UnauthorizedApiKey");
  const forbidJ = refResponse("ForbiddenJurisdiction");
  const forbidA = refResponse("ForbiddenAdmin");
  const forbidKey = refResponse("ForbiddenApiKey");
  const path400 = refResponse("ValidationPathId");
  const query400 = refResponse("ValidationQuery");
  const body400 = refResponse("ValidationFailed");
  const type415 = refResponse("UnsupportedMediaType");
  const dupReading = refResponse("DuplicateReading");
  const dupMeter = refResponse("DuplicateMeterId");
  function loginPath(summary, credentials, userExample) {
    return {
      post: {
        tags: ["Authentication"],
        summary,
        security: [],
        requestBody: jsonBody({ $ref: "#/components/schemas/LoginPayload" }, credentials),
        responses: {
          200: {
            description: "Signed token issued. Call user routes with Authorization: Bearer <access_token>.",
            ...json({ $ref: "#/components/schemas/LoginResponse" }, {
              access_token: "<access_token>",
              token_type: "Bearer",
              message: "Login successful",
              user: userExample
            })
          },
          400: errorResponse(
            "Missing username or password, extra fields, or invalid JSON",
            errorEnvelope("VALIDATION_ERROR", "Missing username or password", [
              { path: "password", message: "Required" }
            ])
          ),
          401: errorResponse(
            "Username and password did not match a stored account",
            errorEnvelope("INVALID_CREDENTIALS", "Invalid credentials")
          ),
          415: type415
        }
      }
    };
  }
  return {
    "/solar/v1/auth/login": loginPath("Exchange stored username and password for a JWT", {
      username: "admin",
      password: "8QGuahGnXIYCL03f"
    }, loginUserExample),
    "/solar/v1/auth/login/national": loginPath("National analyst login", {
      username: "national",
      password: analystPassword
    }, {
      id: 2,
      username: "national",
      name: "National Analyst",
      email: "national@slsea.example",
      role: "national"
    }),
    "/solar/v1/auth/login/provincial": loginPath("Provincial analyst login", {
      username: "western",
      password: analystPassword
    }, {
      id: 3,
      username: "western",
      name: "Provincial Analyst",
      email: "western@slsea.example",
      role: "province"
    }),
    "/solar/v1/auth/login/district": loginPath("District analyst login", {
      username: "colombo",
      password: analystPassword
    }, {
      id: 4,
      username: "colombo",
      name: "District Analyst",
      email: "colombo@slsea.example",
      role: "district"
    }),
    "/solar/v1/provinces": {
      get: {
        tags: ["Provinces"],
        summary: "Return provinces the caller is allowed to see",
        description: "Bare JSON array. national and admin receive every province; a province user receives their assigned province; a district user receives that district's parent province.",
        responses: {
          200: {
            description: "Province array with no pagination wrapper",
            ...json({ type: "array", items: { $ref: "#/components/schemas/Province" } }, [provinceExample])
          },
          401: auth401
        }
      }
    },
    "/solar/v1/provinces/{id}": {
      get: {
        tags: ["Provinces"],
        summary: "Fetch a single province",
        description: "Looks up the province by public integer id. A valid user JWT is required. 403 is returned when that province is outside the caller's territory.",
        parameters: [{ ...idParam, description: "Province integer id" }],
        responses: {
          200: { description: "Province record", ...json({ $ref: "#/components/schemas/Province" }, provinceExample) },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: notFound("Province not found")
        }
      }
    },
    "/solar/v1/provinces/{id}/districts": {
      get: {
        tags: ["Provinces"],
        summary: "List districts under a province",
        description: "Districts with matching province_id, still filtered by the caller's jurisdiction.",
        parameters: [{ ...idParam, description: "Province integer id" }],
        responses: {
          200: {
            description: "District array for that province",
            ...json({ type: "array", items: { $ref: "#/components/schemas/District" } }, [districtExample])
          },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: notFound("Province not found")
        }
      }
    },
    "/solar/v1/districts": {
      get: {
        tags: ["Districts"],
        summary: "Return districts the caller is allowed to see",
        description: "Bare JSON array. national and admin receive every district; a province user receives districts in their province; a district user receives only their assigned district.",
        responses: {
          200: {
            description: "District array with no pagination wrapper",
            ...json({ type: "array", items: { $ref: "#/components/schemas/District" } }, [districtExample])
          },
          401: auth401
        }
      }
    },
    "/solar/v1/districts/{id}": {
      get: {
        tags: ["Districts"],
        summary: "Fetch a single district",
        description: "Looks up the district by public integer id when it sits inside the caller's territory.",
        parameters: [{ ...idParam, description: "District integer id" }],
        responses: {
          200: { description: "District record", ...json({ $ref: "#/components/schemas/District" }, districtExample) },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: notFound("District not found")
        }
      }
    },
    "/solar/v1/districts/{id}/substations": {
      get: {
        tags: ["Districts"],
        summary: "List substations under a district",
        description: "Grid substations whose district_id matches the path, limited to substations the caller may access.",
        parameters: [{ ...idParam, description: "District integer id" }],
        responses: {
          200: {
            description: "GridSubstation array for that district",
            ...json({ type: "array", items: { $ref: "#/components/schemas/GridSubstation" } }, [substationExample])
          },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: notFound("District not found")
        }
      }
    },
    "/solar/v1/districts/{id}/summary": {
      get: {
        tags: ["Districts"],
        summary: "District generation totals",
        description: "Counts active sites in the district, sums each site's newest power_kw and cumulative_energy_kwh, and reports the highest power_kw among those sites.",
        parameters: [{ ...idParam, description: "District integer id" }],
        responses: {
          200: {
            description: "DistrictSummary for the requested district",
            ...json({ $ref: "#/components/schemas/DistrictSummary" }, summaryExample)
          },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: notFound("District not found")
        }
      }
    },
    "/solar/v1/substations": {
      get: {
        tags: ["Substations"],
        summary: "Return substations the caller is allowed to see",
        description: "Bare JSON array using the GridSubstation presenter. Admin and national see every substation. A province user sees substations in districts of their assigned province. A district user sees substations in their assigned district.",
        responses: {
          200: {
            description: "GridSubstation array with no pagination wrapper",
            ...json({ type: "array", items: { $ref: "#/components/schemas/GridSubstation" } }, [substationExample])
          },
          400: query400,
          401: auth401
        }
      }
    },
    "/solar/v1/substations/{id}": {
      get: {
        tags: ["Substations"],
        summary: "Fetch a single substation",
        description: "Looks up the substation by public integer id. 403 when it sits outside the caller's territory.",
        parameters: [{ ...idParam, description: "Grid substation integer id" }],
        responses: {
          200: { description: "GridSubstation record", ...json({ $ref: "#/components/schemas/GridSubstation" }, substationExample) },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: notFound("Substation not found")
        }
      }
    },
    "/solar/v1/substations/{id}/installations": {
      get: {
        tags: ["Substations"],
        summary: "List solar sites on a substation",
        description: "Active installations whose substation_id matches the path. api_key is omitted.",
        parameters: [{ ...idParam, description: "Grid substation integer id" }],
        responses: {
          200: {
            description: "SolarInstallation array (api_key excluded)",
            ...json({ type: "array", items: { $ref: "#/components/schemas/SolarInstallation" } }, [installationExample])
          },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: notFound("Substation not found")
        }
      }
    },
    "/solar/v1/installations": {
      get: {
        tags: ["Solar Installations"],
        summary: "Return solar sites the caller is allowed to see",
        description: "Active installations in jurisdiction. Soft-deleted rows and api_key values are omitted.",
        responses: {
          200: {
            description: "SolarInstallation array",
            ...json({ type: "array", items: { $ref: "#/components/schemas/SolarInstallation" } }, [installationExample])
          },
          401: auth401
        }
      },
      post: {
        tags: ["Solar Installations"],
        summary: "Create a solar installation",
        description: "Administrator JWT with the metadata-write scope. The parent substation must already exist. The response returns the new site and its api_key once; later GET, PUT and DELETE responses omit the key. In Swagger: log in with POST /solar/v1/auth/login, authorize that JWT as UserAuth, call this operation, then copy the returned installation id and api_key. Authorize ApiKeyAuth with that key and POST /solar/v1/installations/{id}/readings for the new site. The example key is a placeholder, not a live credential.",
        requestBody: jsonBody(installationInput, putInstallationExample),
        responses: {
          201: {
            description: "Installation created. api_key is revealed only here.",
            headers: {
              Location: { schema: { type: "string" }, description: "URL of the created installation, /solar/v1/installations/{id}" },
              "Cache-Control": { schema: { type: "string" }, description: "Set to no-store so the one-time key is not cached" }
            },
            ...json({
              type: "object",
              properties: {
                installation: { $ref: "#/components/schemas/SolarInstallation" },
                api_key: {
                  type: "string",
                  example: "YOUR_INSTALLATION_API_KEY",
                  description: "Newly generated device key. Shown only in this response. The example is a placeholder."
                }
              }
            }, {
              installation: installationExample,
              api_key: "YOUR_INSTALLATION_API_KEY"
            })
          },
          400: body400,
          401: auth401,
          403: forbidA,
          404: notFound("Substation not found"),
          409: dupMeter,
          415: type415
        }
      }
    },
    "/solar/v1/installations/{id}": {
      get: {
        tags: ["Solar Installations"],
        summary: "Fetch a solar site with its last reading",
        description: "Site metadata plus last_reading. last_reading is null when the site has no stored readings yet.",
        parameters: [{ ...idParam, description: "Solar installation integer id" }],
        responses: {
          200: {
            description: "CompositeInstallation including last_reading",
            ...json({ $ref: "#/components/schemas/CompositeInstallation" }, compositeExample)
          },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: notFound("Solar installation not found")
        }
      },
      put: {
        tags: ["Solar Installations"],
        summary: "Replace solar installation metadata",
        description: "Writes the listed fields on an existing, not-deleted site. Administrator JWT required. api_key cannot be supplied here.",
        parameters: [{ ...idParam, description: "Solar installation integer id" }],
        requestBody: jsonBody(installationInput, putInstallationExample),
        responses: {
          200: {
            description: "Updated SolarInstallation (api_key excluded)",
            ...json({ $ref: "#/components/schemas/SolarInstallation" }, installationExample)
          },
          400: body400,
          401: auth401,
          403: forbidA,
          404: notFound("Solar installation not found"),
          415: type415
        }
      },
      delete: {
        tags: ["Solar Installations"],
        summary: "Soft-delete a solar installation",
        description: "Sets deleted_at and keeps the row. Later reads treat the site as missing. Administrator JWT required. HTTP 200 with JSON, not 204.",
        parameters: [{ ...idParam, description: "Solar installation integer id" }],
        responses: {
          200: {
            description: "Installation soft deleted successfully",
            ...json({
              type: "object",
              properties: {
                message: { type: "string", description: "Confirmation text" },
                id: { type: "integer", description: "Integer id of the soft-deleted site" }
              }
            }, { message: "Solar installation deleted successfully", id: 1 })
          },
          400: path400,
          401: auth401,
          403: forbidA,
          404: notFound("Solar installation not found")
        }
      }
    },
    "/solar/v1/installations/{id}/readings/latest": {
      get: {
        tags: ["Readings"],
        summary: "Get the newest reading for a site",
        description: "Single most recent reading (timestamp, then id). User JWT required. 404 when the site exists but has no readings.",
        parameters: [{ ...idParam, description: "Solar installation integer id" }],
        responses: {
          200: {
            description: "Bare reading object",
            ...json({ $ref: "#/components/schemas/GenerationReading" }, readingExample)
          },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: errorResponse(
            "Installation is missing, soft-deleted, or has no stored readings",
            errorEnvelope("RESOURCE_NOT_FOUND", "Solar installation not found"),
            {
              examples: {
                missingInstallation: {
                  summary: "Installation does not exist or is soft-deleted",
                  value: errorEnvelope("RESOURCE_NOT_FOUND", "Solar installation not found")
                },
                noReadings: {
                  summary: "Installation exists but has no readings",
                  value: errorEnvelope("RESOURCE_NOT_FOUND", "No readings found for this installation")
                }
              }
            }
          )
        }
      }
    },
    "/solar/v1/installations/{id}/readings/summary": {
      get: {
        tags: ["Readings"],
        summary: "Period energy generated for a site",
        description: "Uses stored cumulative_energy_kwh readings. Energy generated (kWh) = last meter reading − first meter reading in the selected from/to window (hour, day or month). Average power (kW) = energy generated ÷ elapsed hours. Example: 08:00 = 1250.5 kWh, 09:00 = 1254.2 kWh → 3.7 kWh and 3.7 kW. summary is null if a boundary reading is missing or the meter reset. POST /readings still stores the original samples; this route only calculates.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Installation ID" },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" }, description: "Period start ISO date-time" },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" }, description: "Period end ISO date-time" }
        ],
        responses: {
          200: {
            description: "Period summary from cumulative kWh",
            ...json({
              type: "object",
              properties: {
                summary: {
                  type: "object",
                  nullable: true,
                  properties: {
                    energyGeneratedKwh: { type: "number", example: 3.7 },
                    averagePowerKw: { type: "number", example: 3.7 },
                    readingCount: { type: "integer", example: 2 }
                  }
                }
              }
            }, {
              summary: {
                energyGeneratedKwh: 3.7,
                averagePowerKw: 3.7,
                readingCount: 2
              }
            })
          },
          400: query400,
          401: auth401,
          403: forbidJ,
          404: notFound("Solar installation not found")
        }
      }
    },
    "/solar/v1/installations/{id}/readings/{readingId}": {
      get: {
        tags: ["Readings"],
        summary: "Fetch one reading for a site",
        description: "Looks up the reading by public integer id only when it belongs to the path installation. User JWT required. A reading stored under a different installation is 404, not 403.",
        parameters: [
          { ...idParam, description: "Solar installation integer id" },
          { name: "readingId", in: "path", required: true, schema: { type: "integer" }, description: "Public integer reading id" }
        ],
        responses: {
          200: { description: "Bare reading object", ...json({ $ref: "#/components/schemas/GenerationReading" }, readingExample) },
          400: path400,
          401: auth401,
          403: forbidJ,
          404: errorResponse(
            "Installation missing/soft-deleted, or no reading with this id on that installation",
            errorEnvelope("RESOURCE_NOT_FOUND", "Reading not found"),
            {
              examples: {
                missingInstallation: {
                  summary: "Installation does not exist or is soft-deleted",
                  value: errorEnvelope("RESOURCE_NOT_FOUND", "Solar installation not found")
                },
                missingReading: {
                  summary: "No reading with this id on this installation",
                  value: errorEnvelope("RESOURCE_NOT_FOUND", "Reading not found")
                }
              }
            }
          )
        }
      }
    },
    "/solar/v1/installations/{id}/readings": {
      get: {
        tags: ["Readings"],
        summary: "List readings and period energy for a site",
        description: "Paginated readings for the installation. from/to bound timestamp. sort picks timestamp, id, power_kw, cumulative_energy_kwh or voltage; order is asc or desc. summary.energyGeneratedKwh is last cumulative_energy_kwh minus first over the period (for example 1254.2 − 1250.5 = 3.7 kWh in one hour, so averagePowerKw is 3.7). summary is null if boundary readings are missing or the meter reset. POST still stores raw readings; this GET computes the period totals. If-None-Match may yield 304.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Installation ID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "1-based page number" },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Page size" },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" }, description: "Start ISO date-time filter (inclusive lower bound on timestamp)" },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" }, description: "End ISO date-time filter (inclusive upper bound on timestamp)" },
          { name: "sort", in: "query", schema: { type: "string", default: "timestamp" }, description: "Order field: timestamp, id, power_kw, cumulative_energy_kwh, or voltage" },
          { name: "order", in: "query", schema: { type: "string", default: "desc", enum: ["asc", "desc"] }, description: "Ascending or descending order" },
          { name: "If-None-Match", in: "header", schema: { type: "string" }, description: "ETag from a previous GET of this page; matching value yields 304" }
        ],
        responses: {
          200: {
            description: "Paginated readings plus period summary",
            headers: {
              ETag: { schema: { type: "string" }, description: "Validator for this page body" },
              "Cache-Control": { schema: { type: "string" }, description: "Set to private, no-cache on this response" }
            },
            ...json({ $ref: "#/components/schemas/ReadingsHistoryEnvelope" }, historyExample)
          },
          304: {
            description: "Not Modified (ETag matched)",
            headers: { ETag: { schema: { type: "string" }, description: "Validator that matched If-None-Match" } }
          },
          400: query400,
          401: auth401,
          403: forbidJ,
          404: notFound("Solar installation not found")
        }
      },
      post: {
        tags: ["Readings"],
        summary: "Store one meter reading",
        description: "Writes the original meter reading for the path installation. Use that site's X-API-Key only; a user JWT is not accepted. Location identifies the created reading at /solar/v1/installations/{id}/readings/{readingId}.",
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ ...idParam, description: "Solar installation integer id receiving the reading" }],
        requestBody: jsonBody({ $ref: "#/components/schemas/CreateReadingPayload" }),
        responses: {
          201: {
            description: "Reading created successfully",
            headers: {
              Location: { schema: { type: "string" }, description: "Absolute URI of the created reading, /solar/v1/installations/{installationId}/readings/{readingId}" },
              ETag: { schema: { type: "string" }, description: "Validator for the created reading body" },
              "Last-Modified": { schema: { type: "string" }, description: "HTTP-date of the sample timestamp" }
            },
            ...json({ $ref: "#/components/schemas/GenerationReading" }, readingExample)
          },
          400: body400,
          401: apiKey401,
          403: forbidKey,
          404: notFound("Solar installation not found"),
          409: dupReading,
          415: type415
        }
      }
    },
    "/solar/v1/readings": {
      get: {
        tags: ["Readings"],
        summary: "List permitted readings with optional regional filters",
        description: "Read-only analytical listing. Geographic filters province_id, district_id and substation_id are combined with AND and then intersected with the caller's jurisdiction; they never broaden access. Inconsistent nesting (district not in province, or substation not in district/province) is 400. A filter that names an existing resource outside jurisdiction is 403. Missing named geography is 404. This endpoint does not include an energy summary.",
        parameters: [
          { name: "province_id", in: "query", schema: { type: "integer" }, description: "Keep readings whose installation is in this province" },
          { name: "district_id", in: "query", schema: { type: "integer" }, description: "Keep readings whose installation is in this district" },
          { name: "substation_id", in: "query", schema: { type: "integer" }, description: "Keep readings whose installation is on this substation" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "1-based page number" },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Page size, maximum 200" },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" }, description: "Inclusive lower bound on reading timestamp" },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" }, description: "Inclusive upper bound on reading timestamp" },
          { name: "sort", in: "query", schema: { type: "string", default: "timestamp", enum: ["timestamp", "id", "power_kw", "cumulative_energy_kwh", "voltage"] }, description: "Sort field; timestamp uses reading id as a stable tie-breaker" },
          { name: "order", in: "query", schema: { type: "string", default: "desc", enum: ["asc", "desc"] }, description: "Ascending or descending order" },
          { name: "If-None-Match", in: "header", schema: { type: "string" }, description: "ETag from a previous GET of this page; matching value yields 304" }
        ],
        responses: {
          200: {
            description: "Paginated readings without energy summary",
            headers: {
              ETag: { schema: { type: "string" }, description: "Validator for this page body" },
              "Cache-Control": { schema: { type: "string" }, description: "Set to private, no-cache on this response" }
            },
            ...json({ $ref: "#/components/schemas/RegionalReadingsEnvelope" }, {
              count: 2, next: null, previous: null, data: [readingExample]
            })
          },
          304: {
            description: "Not Modified (ETag matched)",
            headers: { ETag: { schema: { type: "string" }, description: "Validator that matched If-None-Match" } }
          },
          400: errorResponse(
            "Invalid pagination, dates, sort, or geographic filters that do not nest under AND",
            errorEnvelope("VALIDATION_ERROR", "district_id is not in the requested province", [
              { path: "district_id", message: "district_id is not in the requested province" }
            ]),
            {
              examples: {
                inconsistentGeography: {
                  summary: "AND filters do not nest",
                  value: errorEnvelope("VALIDATION_ERROR", "district_id is not in the requested province", [
                    { path: "district_id", message: "district_id is not in the requested province" }
                  ])
                },
                reversedWindow: {
                  summary: "from after to",
                  value: errorEnvelope("VALIDATION_ERROR", "from must be earlier than or equal to to", [
                    { path: "from", message: "from must be earlier than or equal to to" }
                  ])
                }
              }
            }
          ),
          401: auth401,
          403: forbidJ,
          404: errorResponse(
            "Named province, district or substation does not exist",
            errorEnvelope("RESOURCE_NOT_FOUND", "Province not found"),
            {
              examples: {
                missingProvince: {
                  summary: "Unknown province_id",
                  value: errorEnvelope("RESOURCE_NOT_FOUND", "Province not found")
                },
                missingDistrict: {
                  summary: "Unknown district_id",
                  value: errorEnvelope("RESOURCE_NOT_FOUND", "District not found")
                },
                missingSubstation: {
                  summary: "Unknown substation_id",
                  value: errorEnvelope("RESOURCE_NOT_FOUND", "Substation not found")
                }
              }
            }
          )
        }
      }
    }
  };
};

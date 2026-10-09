module.exports = function specPaths({
  errorResponse, json, jsonBody, idParam, installationInput,
  provinceExample, districtExample, substationExample, installationExample,
  readingExample, compositeExample, summaryExample, historyExample,
  loginUserExample, putInstallationExample
}) {
  return {
    "/solar/v1/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Exchange stored username and password for a JWT",
        security: [],
        requestBody: jsonBody({ $ref: "#/components/schemas/LoginPayload" }, {
          username: "admin",
          password: "8QGuahGnXIYCL03f"
        }),
        responses: {
          200: {
            description: "Signed token issued. Call user routes with Authorization: Bearer <access_token>.",
            ...json({ $ref: "#/components/schemas/LoginResponse" }, {
              access_token: "<access_token>",
              token_type: "Bearer",
              message: "Login successful",
              user: loginUserExample
            })
          },
          400: errorResponse("Missing username or password"),
          401: errorResponse("Invalid credentials")
        }
      }
    },
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
          401: errorResponse("Invalid user identification")
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Access denied: resource outside jurisdiction"),
          404: errorResponse("Province not found")
        }
      }
    },
    "/solar/v1/provinces/{id}/solar/v1/districts": {
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Province not found")
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
          401: errorResponse("Invalid user identification")
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("District not found")
        }
      }
    },
    "/solar/v1/districts/{id}/solar/v1/substations": {
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("District not found")
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("District not found")
        }
      }
    },
    "/solar/v1/substations/{id}/solar/v1/installations": {
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Substation not found")
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
          401: errorResponse("Invalid user identification")
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Solar installation not found")
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
          400: errorResponse("Validation failed"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Solar installation not found")
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
          403: errorResponse("Forbidden"),
          404: errorResponse("Solar installation not found")
        }
      }
    },
    "/solar/v1/installations/{id}/solar/v1/readings/latest": {
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Solar installation or readings not found")
        }
      }
    },
    "/solar/v1/installations/{id}/solar/v1/readings/summary": {
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Solar installation not found")
        }
      }
    },
    "/solar/v1/installations/{id}/solar/v1/readings": {
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
          401: errorResponse("Invalid user identification"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Solar installation not found")
        }
      },
      post: {
        tags: ["Readings"],
        summary: "Store one meter reading",
        description: "Writes the original meter reading for the path installation. Use that site's X-API-Key only; a user JWT is not accepted. Location is the request URL.",
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ ...idParam, description: "Solar installation integer id receiving the reading" }],
        requestBody: jsonBody({ $ref: "#/components/schemas/CreateReadingPayload" }),
        responses: {
          201: {
            description: "Reading created successfully",
            headers: {
              Location: { schema: { type: "string" }, description: "URL of this ingest request" },
              ETag: { schema: { type: "string" }, description: "Validator for the created reading body" },
              "Last-Modified": { schema: { type: "string" }, description: "HTTP-date of the sample timestamp" }
            },
            ...json({ $ref: "#/components/schemas/GenerationReading" }, readingExample)
          },
          400: errorResponse("Invalid reading payload fields"),
          401: errorResponse("X-API-Key header is required for device ingestion"),
          403: errorResponse("Provided API key does not match this installation"),
          404: errorResponse("Solar installation not found")
        }
      }
    }
  };
};

const express = require("express");
const helmet = require("helmet");
const mongoose = require("mongoose");
const swaggerUiVersion = require("swagger-ui-dist/package.json").version;
const config = require("./config");
const { connectDatabase } = require("./database");
const { requestId, errorHandler, fail } = require("./middleware/errors");
const api = require("./routes");
const { buildOpenApiDocument } = require("./docs/openapi");

const app = express();
app.set("trust proxy", 1);
app.use(requestId);
const swaggerCdn = "https://cdn.jsdelivr.net";

const connectSrc = ["'self'"];
const hostedOrigin = (config.publicOrigin || "https://slsea-solar.vercel.app").replace(/\/solar\/v1$/, "");
connectSrc.push(hostedOrigin);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", swaggerCdn],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", swaggerCdn],
      imgSrc: ["'self'", "data:", swaggerCdn],
      upgradeInsecureRequests: null,
      connectSrc
    }
  }
}));
app.use(express.json({ limit: "32kb" }));

function isLocalBrowserOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || "");
}

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (!isLocalBrowserOrigin(origin)) return next();
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, If-Match, If-None-Match, X-API-Key");
  res.set("Access-Control-Expose-Headers", "ETag, Location");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

function deploymentPayload(req) {
  const origin = `${req.protocol}://${req.get("host")}`;
  return {
    status: "ok",
    message: "Deployment successful",
    environment: process.env.VERCEL ? "vercel" : process.env.NODE_ENV || "development",
    docs: `${origin}${config.base}/docs`,
    openapi: `${origin}${config.base}/openapi.json`
  };
}

function noStore(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
}

function swaggerHtml() {
  const assets = `${swaggerCdn}/npm/swagger-ui-dist@${swaggerUiVersion}`;
  const specUrl = `${config.base}/openapi.json`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-store">
  <title>SLSEA Solar Generation API</title>
  <link rel="stylesheet" href="${assets}/swagger-ui.css">
  <link rel="icon" type="image/png" href="${assets}/favicon-32x32.png" sizes="32x32">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${assets}/swagger-ui-bundle.js"></script>
  <script src="${assets}/swagger-ui-standalone-preset.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${JSON.stringify(specUrl)},
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: false,
      tryItOutEnabled: true,
      displayRequestDuration: true,
      filter: false,
      tagsSorter: (a, b) => {
        const order = [
          "Authentication", "Provinces", "Districts", "Substations",
          "Solar Installations", "Readings"
        ];
        return order.indexOf(a) - order.indexOf(b);
      },
      operationsSorter: (a, b) => {
        const order = [
          "post /solar/v1/auth/login",
          "get /solar/v1/provinces",
          "get /solar/v1/provinces/{id}",
          "get /solar/v1/provinces/{id}/solar/v1/districts",
          "get /solar/v1/districts",
          "get /solar/v1/districts/{id}",
          "get /solar/v1/districts/{id}/solar/v1/substations",
          "get /solar/v1/districts/{id}/summary",
          "get /solar/v1/substations/{id}/installations",
          "get /solar/v1/installations",
          "get /solar/v1/installations/{id}",
          "put /solar/v1/installations/{id}",
          "delete /solar/v1/installations/{id}",
          "get /solar/v1/installations/{id}/readings/latest",
          "get /solar/v1/installations/{id}/readings/summary",
          "get /solar/v1/installations/{id}/readings",
          "post /solar/v1/installations/{id}/readings"
        ];
        const key = (op) => {
          if (op && typeof op.get === "function") {
            return op.get("method") + " " + op.get("path");
          }
          return String(op && op.method || "") + " " + String(op && op.path || "");
        };
        return order.indexOf(key(a)) - order.indexOf(key(b));
      },
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: "StandaloneLayout"
    });
  </script>
</body>
</html>`;
}

app.get("/", (req, res) => {
  const payload = deploymentPayload(req);
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SLSEA Solar API</title>
</head>
<body style="font-family: sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem;">
  <h1>Deployment successful</h1>
  <p>The SLSEA Solar Generation API is running.</p>
  <p><a href="${payload.docs}">Open Swagger docs</a></p>
</body>
</html>`);
});

app.get(`${config.base}/status`, (req, res) => {
  res.json(deploymentPayload(req));
});
app.get([`${config.base}/docs`, `${config.base}/docs/`], (req, res) => {
  noStore(res);
  res.type("html").send(swaggerHtml());
});
app.get(`${config.base}/openapi.json`, (req, res) => {
  noStore(res);
  res.json(buildOpenApiDocument(req));
});
app.get(`${config.base}/health`, async (req, res) => {
  await connectDatabase();
  if (mongoose.connection.readyState !== 1) {
    fail(503, "DATABASE_UNAVAILABLE", "Database is temporarily unavailable");
  }
  res.json({ status: "ok" });
});

app.use(config.base, async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
}, api);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "RESOURCE_NOT_FOUND",
      message: "Resource not found"
    }
  });
});
app.use(errorHandler);

module.exports = app;

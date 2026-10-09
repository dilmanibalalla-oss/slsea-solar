const express = require("express");
const helmet = require("helmet");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-dist");
const config = require("./config");
const { connectDatabase } = require("./database");
const { requestId, errorHandler, fail } = require("./middleware/errors");
const api = require("./routes");
const { buildOpenApiDocument } = require("./docs/openapi");

const app = express();
app.set("trust proxy", 1);
app.use(requestId);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(express.json({ limit: "32kb" }));

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

function swaggerHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Solar Generation API</title>
  <link rel="stylesheet" href="${config.base}/docs-assets/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${config.base}/docs-assets/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${JSON.stringify(`${config.base}/openapi.json`)},
      dom_id: "#swagger-ui",
      persistAuthorization: true
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
app.get(`${config.base}/docs`, (req, res) => {
  res.type("html").send(swaggerHtml());
});
app.use(`${config.base}/docs-assets`, express.static(swaggerUi.absolutePath(), {
  index: false,
  maxAge: "1d"
}));
app.get(`${config.base}/openapi.json`, (req, res) => {
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
      code: "NOT_FOUND",
      message: "Resource not found",
      details: null,
      requestId: req.requestId
    }
  });
});
app.use(errorHandler);

module.exports = app;

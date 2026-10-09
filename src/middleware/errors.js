const { randomUUID } = require("node:crypto");

class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status, code, message, details = null) {
  throw new ApiError(status, code, message, details);
}

function requestId(req, res, next) {
  req.requestId = randomUUID();
  res.set("X-Request-ID", req.requestId);
  next();
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || 500;
  let code = error.code || "INTERNAL_ERROR";
  let message = error.message;
  if (error.name === "ZodError") {
    status = 400;
    code = "VALIDATION_ERROR";
    const login = req.path && req.path.includes("/auth/login");
    message = login ? "Missing username or password" : "Validation failed";
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body is not valid JSON";
  } else if (error.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body exceeds the size limit";
  } else if (error.code === 11000) {
    status = 409;
    code = "DUPLICATE_RESOURCE";
    message = "A resource with these unique values already exists";
  } else if (error.name === "ValidationError" || error.name === "CastError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Validation failed";
  } else if (error.name === "MongoServerSelectionError" || error.name === "MongooseServerSelectionError") {
    status = 503;
    code = "DATABASE_UNAVAILABLE";
    message = "Database is temporarily unavailable";
  }
  if (status >= 500) {
    console.error({ requestId: req.requestId, name: error.name, message: error.message });
    message = status === 503 ? "Service is temporarily unavailable" : "An unexpected server error occurred";
  }
  res.status(status).json({ error: { code, message } });
}

module.exports = { ApiError, fail, requestId, errorHandler };

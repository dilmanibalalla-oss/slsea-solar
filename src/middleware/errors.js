const { randomUUID } = require("node:crypto");

class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }
}

function fail(status, code, message, details = []) {
  throw new ApiError(status, code, message, details);
}

function requestId(req, res, next) {
  req.requestId = randomUUID();
  res.set("X-Request-ID", req.requestId);
  next();
}

function zodDetails(error) {
  return (error.issues || []).map((issue) => ({
    path: issue.path.length ? issue.path.join(".") : "(root)",
    message: issue.message
  }));
}

function loginMissingCredentials(error) {
  const issues = error.issues || [];
  if (!issues.length) return false;
  return issues.every((issue) => {
    const field = issue.path[0];
    return (field === "username" || field === "password")
      && (issue.code === "too_small" || issue.code === "invalid_type");
  });
}

function duplicateFromMongo(error) {
  const keys = Object.keys(error.keyPattern || error.keyValue || {});
  if (keys.includes("installation_id") && keys.includes("timestamp")) {
    return {
      status: 409,
      code: "DUPLICATE_RESOURCE",
      message: "A reading already exists for this installation at this timestamp"
    };
  }
  if (keys.includes("meter_id")) {
    return {
      status: 409,
      code: "DUPLICATE_RESOURCE",
      message: "An installation with this meter_id already exists"
    };
  }
  return {
    status: 409,
    code: "DUPLICATE_RESOURCE",
    message: "A resource with these unique values already exists"
  };
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected server error occurred";
  let details = [];

  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error.name === "ZodError") {
    status = 400;
    code = "VALIDATION_ERROR";
    details = zodDetails(error);
    const login = req.path && req.path.includes("/auth/login");
    message = login && loginMissingCredentials(error)
      ? "Missing username or password"
      : "Validation failed";
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body is not valid JSON";
  } else if (error.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body exceeds the size limit";
  } else if (!(error instanceof ApiError) && Number(error.code) === 11000) {
    ({ status, code, message } = duplicateFromMongo(error));
  } else if (error.name === "ValidationError" || error.name === "CastError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Validation failed";
  } else if (error.name === "MongoServerSelectionError" || error.name === "MongooseServerSelectionError") {
    status = 500;
    code = "INTERNAL_ERROR";
    message = "An unexpected server error occurred";
  }

  if (!(error instanceof ApiError) && status >= 500) {
    console.error({ requestId: req.requestId, name: error.name });
    status = 500;
    code = "INTERNAL_ERROR";
    message = "An unexpected server error occurred";
    details = [];
  }

  res.status(status).json({
    error: {
      code,
      message,
      details: Array.isArray(details) ? details : []
    }
  });
}

module.exports = { ApiError, fail, requestId, errorHandler };

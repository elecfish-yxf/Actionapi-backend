const http = require("http");
const { URL } = require("url");
const { getActionByPath } = require("./action-registry");
const { buildOpenApiSpec } = require("./openapi");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8787);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 1024 * 1024);
const corsOrigins = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const actionApiKey = process.env.ACTION_API_KEY || "";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, statusCode, code, message, details) {
  sendJson(res, statusCode, {
    ok: false,
    error: {
      code,
      message,
      ...(details && details.length ? { details } : {})
    }
  });
}

function setCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin;
  const allowAnyOrigin = corsOrigins.includes("*");
  const allowedOrigin =
    allowAnyOrigin || !requestOrigin || corsOrigins.includes(requestOrigin)
      ? requestOrigin || "*"
      : corsOrigins[0];

  res.setHeader("access-control-allow-origin", allowAnyOrigin ? "*" : allowedOrigin);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization,x-action-api-key");
}

function isAuthorized(req) {
  if (!actionApiKey) {
    return true;
  }

  const authorization = req.headers.authorization || "";
  const bearerToken = authorization.replace(/^bearer\s+/i, "").trim();
  const headerToken = req.headers["x-action-api-key"];
  return bearerToken === actionApiKey || headerToken === actionApiKey;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error("Request body is too large."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(Object.assign(error, { statusCode: 400, code: "invalid_json" }));
      }
    });

    req.on("error", reject);
  });
}

function validate(schema, value, path = "$") {
  const issues = [];

  if (!schema) {
    return issues;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    return [`${path} must be one of: ${schema.enum.join(", ")}.`];
  }

  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [`${path} must be an object.`];
    }

    for (const requiredKey of schema.required || []) {
      if (!(requiredKey in value)) {
        issues.push(`${path}.${requiredKey} is required.`);
      }
    }

    if (schema.additionalProperties === false) {
      const allowedKeys = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          issues.push(`${path}.${key} is not allowed.`);
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
      if (key in value) {
        issues.push(...validate(propertySchema, value[key], `${path}.${key}`));
      }
    }

    return issues;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      return [`${path} must be an array.`];
    }

    value.forEach((item, index) => {
      issues.push(...validate(schema.items, item, `${path}[${index}]`));
    });

    return issues;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      return [`${path} must be a string.`];
    }
    if (schema.minLength && value.length < schema.minLength) {
      issues.push(`${path} must be at least ${schema.minLength} character(s).`);
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      issues.push(`${path} must be no more than ${schema.maxLength} character(s).`);
    }
    return issues;
  }

  if (schema.type === "number") {
    if (typeof value !== "number") {
      return [`${path} must be a number.`];
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push(`${path} must be at least ${schema.minimum}.`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push(`${path} must be no more than ${schema.maximum}.`);
    }
    return issues;
  }

  if (schema.type === "integer") {
    if (!Number.isInteger(value)) {
      return [`${path} must be an integer.`];
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push(`${path} must be at least ${schema.minimum}.`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push(`${path} must be no more than ${schema.maximum}.`);
    }
    return issues;
  }

  if (schema.type === "boolean" && typeof value !== "boolean") {
    return [`${path} must be a boolean.`];
  }

  return issues;
}

async function handleAction(req, res, action) {
  let input;

  try {
    input = await readJsonBody(req);
  } catch (error) {
    const statusCode = error.statusCode || 400;
    sendError(res, statusCode, error.code || "invalid_request", error.message);
    return;
  }

  const issues = validate(action.inputSchema, input);
  if (issues.length) {
    sendError(res, 400, "validation_error", "Request body does not match the action schema.", issues);
    return;
  }

  try {
    const result = await action.handler(input, {
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers
      }
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, 500, "action_failed", error.message || "Action failed.");
  }
}

async function router(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname.replace(/\/+$/, "") || "/";

  if (pathname.startsWith("/actions/") && !isAuthorized(req)) {
    sendError(res, 401, "unauthorized", "Missing or invalid action API key.");
    return;
  }

  if (req.method === "GET" && pathname === "/") {
    sendJson(res, 200, {
      ok: true,
      name: "actionapi-backend",
      endpoints: {
        health: "/health",
        openapi: "/openapi.json"
      }
    });
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (req.method === "GET" && pathname === "/openapi.json") {
    sendJson(res, 200, buildOpenApiSpec());
    return;
  }

  const action = getActionByPath(pathname);
  if (action && req.method === action.method) {
    await handleAction(req, res, action);
    return;
  }

  if (action) {
    sendError(res, 405, "method_not_allowed", `Use ${action.method} for ${action.path}.`);
    return;
  }

  sendError(res, 404, "not_found", "Route not found.");
}

const server = http.createServer((req, res) => {
  router(req, res).catch((error) => {
    sendError(res, 500, "server_error", error.message || "Unexpected server error.");
  });
});

server.listen(port, host, () => {
  console.log(`Action API backend listening on http://${host}:${port}`);
  console.log(`OpenAPI schema: http://localhost:${port}/openapi.json`);
});

const { actions } = require("./action-registry");

const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "error"],
  properties: {
    ok: {
      type: "boolean",
      enum: [false]
    },
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: {
          type: "string"
        },
        message: {
          type: "string"
        },
        details: {
          type: "array",
          items: {
            type: "string"
          }
        }
      }
    }
  }
};

const healthResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "status", "timestamp"],
  properties: {
    ok: {
      type: "boolean"
    },
    status: {
      type: "string",
      enum: ["healthy"]
    },
    timestamp: {
      type: "string",
      format: "date-time"
    }
  }
};

function toOperationId(id) {
  return String(id || "action")
    .replace(/[^a-zA-Z0-9_ -]/g, "")
    .replace(/[_ -]+([a-zA-Z0-9])/g, (_, char) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function toSchemaName(id, suffix) {
  const base = String(id || "Action")
    .replace(/[^a-zA-Z0-9_ -]/g, " ")
    .split(/[_ -]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return `${base || "Action"}${suffix}`;
}

function safeSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return {
      type: "object",
      additionalProperties: true
    };
  }

  return schema;
}

function buildOpenApiSpec(options = {}) {
  const baseUrl =
    options.baseUrl || process.env.BASE_URL || "http://localhost:8787";

  const requiresAuth = Boolean(process.env.ACTION_API_KEY);

  const components = {
    schemas: {
      ErrorResponse: errorResponseSchema,
      HealthResponse: healthResponseSchema
    }
  };

  if (requiresAuth) {
    components.securitySchemes = {
      ActionApiKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Action API key"
      }
    };
  }

  const paths = {
    "/health": {
      get: {
        operationId: "health",
        summary: "Health check",
        responses: {
          "200": {
            description: "Service status.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse"
                }
              }
            }
          }
        }
      }
    }
  };

  for (const action of actions) {
    const inputSchemaName = toSchemaName(action.id, "Input");
    const outputSchemaName = toSchemaName(action.id, "Output");

    components.schemas[inputSchemaName] = safeSchema(action.inputSchema);
    components.schemas[outputSchemaName] = safeSchema(action.outputSchema);

    paths[action.path] = {
      post: {
        operationId: toOperationId(action.id),
        summary: action.summary || action.id,
        description: action.description || action.summary || action.id,
        ...(requiresAuth ? { security: [{ ActionApiKey: [] }] } : {}),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${inputSchemaName}`
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Action result.",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${outputSchemaName}`
                }
              }
            }
          },
          "400": {
            description: "Invalid request.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            description: "Server error.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    };

    if (requiresAuth) {
      paths[action.path].post.responses["401"] = {
        description: "Missing or invalid API key.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse"
            }
          }
        }
      };
    }
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Action API Backend",
      version: "0.1.0",
      description:
        "Generated OpenAPI contract for actions exposed by this backend."
    },
    servers: [
      {
        url: baseUrl
      }
    ],
    paths,
    components
  };
}

module.exports = {
  buildOpenApiSpec
};

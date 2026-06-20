const { actions } = require("./action-registry");

const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "error"],
  properties: {
    ok: {
      type: "boolean",
      const: false
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

function buildOpenApiSpec(options = {}) {
  const baseUrl = options.baseUrl || process.env.BASE_URL || "http://localhost:8787";
  const requiresAuth = Boolean(process.env.ACTION_API_KEY);
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
                }
              }
            }
          }
        }
      }
    }
  };

  for (const action of actions) {
    paths[action.path] = {
      post: {
        operationId: action.id,
        summary: action.summary,
        description: action.description,
        ...(requiresAuth ? { security: [{ ActionApiKey: [] }] } : {}),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: action.inputSchema
            }
          }
        },
        responses: {
          "200": {
            description: "Action result.",
            content: {
              "application/json": {
                schema: action.outputSchema
              }
            }
          },
          "400": {
            description: "Invalid request.",
            content: {
              "application/json": {
                schema: errorResponseSchema
              }
            }
          },
          "500": {
            description: "Server error.",
            content: {
              "application/json": {
                schema: errorResponseSchema
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
            schema: errorResponseSchema
          }
        }
      };
    }
  }

  const spec = {
    openapi: "3.1.0",
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
    paths
  };

  if (requiresAuth) {
    spec.components = {
      securitySchemes: {
        ActionApiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Action API key"
        }
      }
    };
  }

  return spec;
}

module.exports = {
  buildOpenApiSpec
};

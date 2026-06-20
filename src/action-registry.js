const writingActions = require("./writing-actions");

const echoAction = {
  id: "echo",
  method: "POST",
  path: "/actions/echo",
  summary: "Echo a message",
  description:
    "Reference action that returns the message it receives. Replace or copy this action when adding real business APIs.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: {
      message: {
        type: "string",
        minLength: 1,
        description: "Message to send to the backend."
      }
    }
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["ok", "message", "receivedAt"],
    properties: {
      ok: {
        type: "boolean"
      },
      message: {
        type: "string"
      },
      receivedAt: {
        type: "string",
        format: "date-time"
      }
    }
  },
  async handler(input) {
    return {
      ok: true,
      message: input.message,
      receivedAt: new Date().toISOString()
    };
  }
};

const actions = [echoAction, ...writingActions];

function getActionByPath(pathname) {
  return actions.find((action) => action.path === pathname);
}

module.exports = {
  actions,
  getActionByPath
};

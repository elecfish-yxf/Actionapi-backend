const fs = require("fs");
const path = require("path");
const { buildOpenApiSpec } = require("../src/openapi");

const outputPath = process.argv[2] || "outputs/openapi.actionapi.json";
const resolvedOutputPath = path.resolve(outputPath);

fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(
  resolvedOutputPath,
  `${JSON.stringify(buildOpenApiSpec(), null, 2)}\n`,
  "utf8"
);

console.log(`OpenAPI schema written to ${resolvedOutputPath}`);

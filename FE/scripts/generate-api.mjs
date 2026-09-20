import fs from "node:fs";
const doc = JSON.parse(
  fs.readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"),
);
const schemaType = (s) =>
  s.enum
    ? s.enum.map(JSON.stringify).join(" | ")
    : s.type === "object"
      ? "{ " +
        Object.entries(s.properties || {})
          .map(
            ([k, v]) =>
              `${JSON.stringify(k)}${s.required?.includes(k) ? "" : "?"}: ${schemaType(v)}`,
          )
          .join("; ") +
        " }"
      : s.type === "array"
        ? `Array<${schemaType(s.items || {})}>`
        : s.type === "integer" || s.type === "number"
          ? "number"
          : s.type === "boolean"
            ? "boolean"
            : "string";
const exampleType = (v) =>
  v === null
    ? "unknown | null"
    : Array.isArray(v)
      ? `Array<${v.length ? exampleType(v[0]) : "unknown"}>`
      : typeof v === "object"
        ? "{ " +
          Object.entries(v)
            .map(([k, v]) => `${JSON.stringify(k)}: ${exampleType(v)}`)
            .join("; ") +
          " }"
        : typeof v;
let ts =
  "// Generated from Swagger. Response types describe documented examples, not exhaustive schemas.\n";
const ops = {};
let md =
  "# OpenAPI endpoint inventory\n\nSource: https://sports-center-management-system.onrender.com/api/v1/docs/swagger-ui-init.js\n\nSnapshot: 2026-09-12. Production base: https://sports-center-management-system.onrender.com/api/v1\n\nResponse examples are documentation only, never application data. Coaches use undefined bearerAuth capitalization; client sends the documented HTTP Bearer token.\n";
for (const [p, methods] of Object.entries(doc.paths))
  for (const [m, o] of Object.entries(methods)) {
    const key = m.toUpperCase() + " " + p;
    const body = o.requestBody?.content?.["application/json"]?.schema;
    const name = (m + " " + p)
      .replace(/[{}]/g, "")
      .split(/[^a-zA-Z0-9]+/)
      .map((x) => x[0]?.toUpperCase() + x.slice(1))
      .join("");
    const responses = Object.fromEntries(
      Object.entries(o.responses).map(([code, r]) => [
        code,
        r.$ref ? doc.components.responses[r.$ref.split("/").pop()] : r,
      ]),
    );
    ops[key] = {
      path: p,
      method: m.toUpperCase(),
      summary: o.summary,
      security: o.security ?? doc.security,
      parameters: o.parameters || [],
      body: body || null,
      statusCodes: Object.keys(responses),
    };
    if (body) ts += `export type ${name}Request = ${schemaType(body)};\n`;
    md += `\n## ${key}\n${o.summary}\n\nAuthentication: ${JSON.stringify(o.security ?? doc.security)}\n\nParameters: \n\`\`\`json\n${JSON.stringify(o.parameters || [], null, 2)}\n\`\`\`\nRequest body:\n\`\`\`json\n${JSON.stringify(body || null, null, 2)}\n\`\`\`\nResponses/status codes:\n\`\`\`json\n${JSON.stringify(responses, null, 2)}\n\`\`\`\n`;
  }
for (const [k, r] of Object.entries(doc.components.responses)) {
  const ex = r.content?.["application/json"]?.schema?.example;
  if (ex) ts += `export type ${k} = ${exampleType(ex)};\n`;
}
fs.writeFileSync(new URL("../src/shared/generated.ts", import.meta.url), ts);
fs.writeFileSync(
  new URL("../src/shared/operations.json", import.meta.url),
  JSON.stringify(ops, null, 2),
);
fs.writeFileSync(new URL("../docs/API_INVENTORY.md", import.meta.url), md);
console.log(`Generated ${Object.keys(ops).length} documented operations`);

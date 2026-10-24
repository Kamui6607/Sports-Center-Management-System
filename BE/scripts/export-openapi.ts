/**
 * Xuất OpenAPI (swagger-jsdoc) của BE ĐANG CHECKOUT ra file JSON — không cần chạy server/DB.
 * Dùng làm snapshot contract cho FE (`FE/docs/openapi.json`), thay vì tải Swagger từ Render.
 *
 *   npm run openapi:export                 # ghi ../FE/docs/openapi.json
 *   npm run openapi:export -- <đường-dẫn>  # ghi file khác
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { swaggerSpec } from "../src/config/swagger.js";

const target = resolve(process.argv[2] ?? "../FE/docs/openapi.json");
writeFileSync(target, JSON.stringify(swaggerSpec, null, 2) + "\n");
const spec = swaggerSpec as { paths?: Record<string, Record<string, unknown>> };
const ops = Object.values(spec.paths ?? {}).reduce((n, p) => n + Object.keys(p).length, 0);
console.log(`[openapi] ${ops} operations -> ${target}`);

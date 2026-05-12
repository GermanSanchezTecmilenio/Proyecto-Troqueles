import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const target = path.join(publicDir, "config.js");

const apiBaseUrl = process.env.ZSISTEMA_API_BASE_URL || "";
const content = `window.ZSISTEMA_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`;

await fs.writeFile(target, content, "utf8");
console.log(`Netlify config generated with API base: ${apiBaseUrl || "(same origin)"}`);

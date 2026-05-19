import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const target = path.join(publicDir, "config.js");

const externalApiBaseUrl = process.env.TORNOS_API_BASE_URL || process.env.ZSISTEMA_API_BASE_URL || "";
const useExternalApi = envFlag(process.env.NETLIFY_USE_EXTERNAL_API) || (!process.env.NETLIFY && externalApiBaseUrl);
const apiBaseUrl = useExternalApi ? externalApiBaseUrl : "";
const content = [
  `window.TORNOS_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};`,
  `window.ZSISTEMA_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};`
].join("\n") + "\n";

await fs.writeFile(target, content, "utf8");
console.log(`Netlify config generated with API base: ${apiBaseUrl || "(same origin)"}`);

function envFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

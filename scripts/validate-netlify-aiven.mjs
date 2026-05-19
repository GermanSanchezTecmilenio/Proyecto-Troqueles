import dotenv from "dotenv";
import http from "node:http";
import { existsSync } from "node:fs";

const localEnv = dotenv.config({ path: ".env" }).parsed || {};
const aivenEnv = dotenv.config({ path: ".env.aiven" }).parsed || {};

if (!aivenEnv.AIVEN_DB_URL) {
  throw new Error("Falta .env.aiven con AIVEN_DB_URL.");
}

const url = new URL(aivenEnv.AIVEN_DB_URL.replace(/^jdbc:/, ""));
process.env.NETLIFY = "true";
process.env.NODE_ENV = "production";
process.env.URL = process.env.URL || "https://local-netlify-validation.example";
process.env.DB_URL = aivenEnv.AIVEN_DB_URL;
process.env.DB_USER = decodeURIComponent(url.username || "");
process.env.DB_PASSWORD = decodeURIComponent(url.password || "");
process.env.DB_SSL = "true";
process.env.DB_SSL_CA_FILE = aivenEnv.AIVEN_DB_SSL_CA_FILE || localEnv.DB_SSL_CA_FILE || "aiven-ca.pem";
process.env.DB_SSL_REJECT_UNAUTHORIZED = aivenEnv.AIVEN_DB_SSL_REJECT_UNAUTHORIZED || "true";
process.env.APP_SESSION_STORAGE = "database";
process.env.APP_UPLOAD_STORAGE = "database";
process.env.DB_POOL_SIZE = process.env.DB_POOL_SIZE || "2";

if (!existsSync(process.env.DB_SSL_CA_FILE)) {
  throw new Error(`No existe el CA configurado: ${process.env.DB_SSL_CA_FILE}`);
}

const { app, initializeApplication } = await import("../src/server.js");
await initializeApplication();

const server = app.listen(0, () => {
  const { port } = server.address();
  http.get(`http://127.0.0.1:${port}/api/health`, response => {
    let body = "";
    response.on("data", chunk => body += chunk);
    response.on("end", () => {
      console.log(`Netlify/Aiven health status: ${response.statusCode}`);
      console.log(body);
      process.exit(response.statusCode === 200 ? 0 : 1);
    });
  }).on("error", error => {
    console.error(error.message);
    process.exit(1);
  });
});

setTimeout(() => {
  console.error("Timeout validando Netlify/Aiven.");
  process.exit(1);
}, 30000);

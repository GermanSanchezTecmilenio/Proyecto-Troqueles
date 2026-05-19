import serverless from "serverless-http";
import { app, initializeApplication } from "../../src/server.js";

const functionPath = "/.netlify/functions/api";
const expressHandler = serverless(app, {
  binary: [
    "application/pdf",
    "application/rtf",
    "application/octet-stream",
    "application/dxf",
    "application/x-dxf",
    "application/step",
    "application/x-step",
    "application/iges",
    "application/acad",
    "application/x-acad",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/vnd.dwg",
    "image/x-dwg",
    "model/step",
    "model/iges"
  ]
});

export async function handler(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  await initializeApplication();
  return expressHandler(normalizeEventPath(event), context);
}

function normalizeEventPath(event) {
  const normalized = { ...event };
  if (normalized.path?.startsWith(functionPath)) {
    normalized.path = normalized.path.slice(functionPath.length) || "/";
  }
  return normalized;
}

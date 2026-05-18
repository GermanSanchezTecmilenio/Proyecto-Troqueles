import dotenv from "dotenv";
import { Agent, run, setDefaultOpenAIKey } from "@openai/agents";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const focus = argValue("--focus=") || "codigo, seguridad de codigo, infraestructura y arquitectura";
const outputPath = path.resolve(projectRoot, argValue("--output=") || process.env.AI_REVIEW_OUTPUT || "docs/ai-review-report.md");
const maxContextChars = Number(process.env.AI_REVIEW_MAX_CONTEXT_CHARS || 120000);

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY no esta configurada. Agregala en .env para ejecutar la revision IA.");
  process.exitCode = 1;
} else {
  setDefaultOpenAIKey(process.env.OPENAI_API_KEY);
  try {
    await main();
  } catch (error) {
    console.error(error?.message || "No se pudo generar la revision IA.");
    process.exitCode = 1;
  }
}

async function main() {
  const checks = [
    commandSection("git status --short", "git", ["status", "--short"]),
    commandSection("git diff", "git", ["diff", "--", "."]),
    commandSection("npm run check", npmCommand(), ["run", "check"]),
    commandSection("npm audit --audit-level=moderate", npmCommand(), ["audit", "--audit-level=moderate"])
  ];

  const fileSections = await selectedFileSections();
  const context = truncate(
    [
      ...checks,
      ...fileSections
    ].join("\n\n"),
    maxContextChars
  );

  const reviewAgent = new Agent({
    name: "Revisor tecnico Tornos",
    instructions: [
      "Eres un revisor senior de codigo, seguridad, infraestructura y arquitectura.",
      "Tu trabajo es revisar el repositorio y producir hallazgos accionables, no proponer una integracion de IA al frontend.",
      "Prioriza riesgos reales sobre estilo. Si no hay evidencia suficiente, dilo explicitamente.",
      "Usa severidades Critico, Alto, Medio y Bajo. Incluye archivo o modulo afectado cuando sea posible.",
      "Cubre como minimo: seguridad de codigo, autenticacion/autorizacion, datos y migraciones, infraestructura/despliegue, dependencias y arquitectura.",
      "Responde en espanol, en Markdown, con una lista corta de acciones recomendadas al final."
    ].join("\n")
  });

  const prompt = [
    `Fecha de revision: ${new Date().toISOString()}`,
    `Foco solicitado: ${focus}`,
    "",
    "Contexto del repositorio:",
    context
  ].join("\n");

  const result = await run(reviewAgent, prompt, { maxTurns: 1 });
  const finalOutput = String(result.finalOutput || "").trim();
  if (!finalOutput) {
    throw new Error("El agente no devolvio contenido para el reporte.");
  }

  const report = [
    "# Revision IA de codigo, seguridad, infraestructura y arquitectura",
    "",
    `Generado: ${new Date().toISOString()}`,
    `Foco: ${focus}`,
    "",
    finalOutput,
    ""
  ].join("\n");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, report, "utf8");
  console.log(`Reporte generado en ${path.relative(projectRoot, outputPath)}`);
}

async function selectedFileSections() {
  const baseFiles = [
    "package.json",
    ".env.example",
    "docker-compose.yml",
    "netlify.toml",
    "README.md",
    "docs/seguridad.md",
    "docs/api-rest.md",
    "docs/modelo-datos-inicial.md",
    "src/server.js",
    "public/index.html",
    "public/js/api.js",
    "public/js/app.js",
    "public/styles.css"
  ];
  const migrations = (await listFiles(path.join(projectRoot, "db", "migrations")))
    .filter(file => file.endsWith(".sql"))
    .sort()
    .slice(-6)
    .map(file => path.relative(projectRoot, file));

  const files = [...baseFiles, ...migrations];
  const sections = [];
  for (const file of files) {
    const absolutePath = path.join(projectRoot, file);
    const text = await readFileIfExists(absolutePath);
    if (!text) continue;
    sections.push(formatSection(`Archivo ${file}`, truncate(text, 18000)));
  }
  return sections;
}

async function listFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(entry => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : fullPath;
    }));
    return files.flat();
  } catch {
    return [];
  }
}

async function readFileIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

function commandSection(title, command, args) {
  return formatSection(title, truncate(runCommand(command, args), 30000));
}

function runCommand(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8
    });
  } catch (error) {
    return [
      `Comando termino con codigo ${error.status ?? "desconocido"}.`,
      String(error.stdout || "").trim(),
      String(error.stderr || error.message || "").trim()
    ].filter(Boolean).join("\n");
  }
}

function formatSection(title, body) {
  return `## ${title}\n\n\`\`\`text\n${body.trim() || "(sin salida)"}\n\`\`\``;
}

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[contenido truncado: ${text.length - limit} caracteres omitidos]`;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function argValue(prefix) {
  const match = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

import dotenv from "dotenv";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(projectRoot, "db", "migrations");
const DEFAULT_DB_NAME = "tornos_sa_cv";
const BATCH_SIZE = 200;

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const replaceTarget = args.has("--replace-target");
const dryRun = args.has("--dry-run") || !apply;

if (args.has("--help")) {
  printUsage();
  process.exit(0);
}

await main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  const localEnv = {
    ...readEnvFile(".env"),
    ...pickEnv(["LOCAL_DB_URL", "LOCAL_DB_HOST", "LOCAL_DB_PORT", "LOCAL_DB_NAME", "LOCAL_DB_USER", "LOCAL_DB_PASSWORD"])
  };
  const aivenEnv = {
    ...readEnvFile("config/local/.env.aiven"),
    ...readEnvFile(".env.aiven"),
    ...process.env
  };

  const localConfig = parseDbConfig(localEnv, {
    label: "local",
    defaultDatabase: DEFAULT_DB_NAME,
    urlKeys: ["LOCAL_DB_URL", "DB_URL"],
    prefix: "LOCAL_",
    defaultSsl: false
  });

  const aivenConfig = parseDbConfig(aivenEnv, {
    label: "Aiven",
    defaultDatabase: "defaultdb",
    urlKeys: ["AIVEN_DB_URL", "AIVEN_MYSQL_URI", "AIVEN_MYSQL_URL", "DB_URL", "DATABASE_URL", "MYSQL_URL", "MYSQL_URI"],
    prefix: "AIVEN_",
    defaultSsl: true
  });

  if (!aivenConfig.host.includes("aivencloud.com")) {
    console.warn("Aviso: el host destino no parece ser de Aiven. Revisa config/local/.env.aiven antes de aplicar.");
  }

  let local;
  let target;
  try {
    local = await mysql.createConnection({ ...localConfig, multipleStatements: false, dateStrings: true });
    await ensureDatabase(aivenConfig);
    target = await mysql.createConnection({ ...aivenConfig, multipleStatements: true, dateStrings: true });

    console.log(`Origen local: ${safeConnectionLabel(localConfig)}`);
    console.log(`Destino Aiven: ${safeConnectionLabel(aivenConfig)}`);

    await applyMigrations(target);

    const localTables = await listTables(local);
    const targetTables = await listTables(target);
    const missingTables = localTables.filter(table => !targetTables.includes(table));
    if (missingTables.length) {
      throw new Error(`Aiven no tiene estas tablas despues de migraciones: ${missingTables.join(", ")}`);
    }

    const localCounts = await tableCounts(local, localTables);
    const targetCounts = await tableCounts(target, localTables);
    printCounts("Local", localCounts);
    printCounts("Aiven", targetCounts);

    const targetRows = [...targetCounts.values()].reduce((sum, value) => sum + value, 0);
    if (dryRun) {
      console.log("");
      console.log("Modo revision: no se copio informacion.");
      console.log("Para copiar local -> Aiven ejecuta: npm run aiven:migrate");
      return;
    }

    if (!replaceTarget && targetRows > 0) {
      throw new Error("Aiven ya tiene datos. Usa --replace-target para reemplazarlos con la copia local.");
    }

    await replaceData(local, target, localTables);
    const finalCounts = await tableCounts(target, localTables);
    assertCountsMatch(localCounts, finalCounts);
    printCounts("Aiven despues de copiar", finalCounts);
    console.log("");
    console.log("Migracion completada: Aiven tiene los mismos conteos que MySQL local.");
  } finally {
    if (local) await local.end();
    if (target) await target.end();
  }
}

function printUsage() {
  console.log("Uso:");
  console.log("  npm run aiven:check");
  console.log("  npm run aiven:migrate");
  console.log("");
  console.log("Configura primero config/local/.env.aiven con AIVEN_DB_URL y el CA de Aiven.");
}

function readEnvFile(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  if (!existsSync(filePath)) return {};
  return dotenv.parse(readFileSync(filePath));
}

function pickEnv(keys) {
  return Object.fromEntries(keys.filter(key => process.env[key] != null).map(key => [key, process.env[key]]));
}

function parseDbConfig(env, options) {
  const urlText = firstValue(env, options.urlKeys);
  if (urlText) {
    const url = new URL(urlText.replace(/^jdbc:/, ""));
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      database: url.pathname.replace(/^\//, "") || options.defaultDatabase,
      user: env[`${options.prefix}DB_USER`] || decodeCredential(url.username) || env.DB_USER,
      password: env[`${options.prefix}DB_PASSWORD`] || decodeCredential(url.password) || env.DB_PASSWORD,
      charset: "utf8mb4",
      ssl: shouldUseSsl(url, env, options) ? sslConfig(env, options.prefix) : undefined
    };
  }

  const host = env[`${options.prefix}DB_HOST`] || env.DB_HOST;
  if (!host) {
    throw new Error(`Falta configurar ${options.label}. Copia config/env/.env.aiven.example como config/local/.env.aiven y llena AIVEN_DB_URL.`);
  }

  return {
    host,
    port: Number(env[`${options.prefix}DB_PORT`] || env.DB_PORT || 3306),
    database: env[`${options.prefix}DB_NAME`] || env.DB_NAME || options.defaultDatabase,
    user: env[`${options.prefix}DB_USER`] || env.DB_USER || "avnadmin",
    password: env[`${options.prefix}DB_PASSWORD`] || env.DB_PASSWORD || "",
    charset: "utf8mb4",
    ssl: shouldUseSsl(null, env, options) ? sslConfig(env, options.prefix) : undefined
  };
}

function firstValue(env, keys) {
  return keys.map(key => env[key]).find(value => value != null && String(value).trim() !== "");
}

function decodeCredential(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function shouldUseSsl(url, env, options) {
  const explicit = env[`${options.prefix}DB_SSL`] ?? env.DB_SSL;
  if (explicit != null) return envFlag(explicit);
  if (url) {
    const mode = (url.searchParams.get("ssl-mode") || url.searchParams.get("sslmode") || "").toLowerCase();
    if (mode) return !["disabled", "disable", "false", "0"].includes(mode);
    const useSsl = url.searchParams.get("useSSL") ?? url.searchParams.get("ssl");
    if (useSsl != null) return envFlag(useSsl);
    return options.defaultSsl || url.hostname.includes("aivencloud.com");
  }
  return options.defaultSsl;
}

function sslConfig(env, prefix) {
  const rejectUnauthorized = String(env[`${prefix}DB_SSL_REJECT_UNAUTHORIZED`] ?? env.DB_SSL_REJECT_UNAUTHORIZED ?? "true").toLowerCase() !== "false";
  const ca = sslCa(env, prefix);
  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {})
  };
}

function sslCa(env, prefix) {
  const base64 = env[`${prefix}DB_SSL_CA_BASE64`] || env.DB_SSL_CA_BASE64;
  if (base64) return Buffer.from(base64, "base64").toString("utf8");
  const inline = env[`${prefix}DB_SSL_CA`] || env.DB_SSL_CA;
  if (inline) return inline.replace(/\\n/g, "\n");
  const file = env[`${prefix}DB_SSL_CA_FILE`] || env.DB_SSL_CA_FILE;
  if (file) return readFileSync(resolveConfigFile(file), "utf8");
  return "";
}

function resolveConfigFile(filePath) {
  const candidates = [
    path.resolve(projectRoot, filePath),
    path.resolve(projectRoot, "config", "local", filePath)
  ];
  const match = candidates.find(candidate => existsSync(candidate));
  return match || candidates[0];
}

function envFlag(value) {
  return ["1", "true", "yes", "required", "require", "verify_ca", "verify-ca", "verify_identity", "verify-identity"].includes(String(value || "").toLowerCase());
}

function safeConnectionLabel(config) {
  return `host=${config.host}; port=${config.port}; database=${config.database}; user=${config.user}`;
}

async function ensureDatabase(config) {
  const { database, ...base } = config;
  let conn;
  try {
    conn = await mysql.createConnection({ ...base, multipleStatements: true });
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${qid(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } catch (error) {
    if (error.code !== "ER_DBACCESS_DENIED_ERROR" && error.code !== "ER_ACCESS_DENIED_ERROR") throw error;
  } finally {
    if (conn) await conn.end();
  }
}

async function applyMigrations(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(190) NOT NULL PRIMARY KEY,
      applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  const [rows] = await conn.query("SELECT id FROM schema_migrations");
  const applied = new Set(rows.map(row => row.id));
  const appliedVersions = new Set(rows.map(row => migrationVersion(row.id)).filter(Boolean));
  const files = (await fs.readdir(migrationsDir)).filter(file => /^V\d+__.+\.sql$/i.test(file)).sort(versionSort);

  for (const file of files) {
    if (applied.has(file)) continue;
    if (appliedVersions.has(migrationVersion(file))) {
      await conn.query("INSERT IGNORE INTO schema_migrations (id) VALUES (?)", [file]);
      continue;
    }
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await conn.query(sql);
    await conn.query("INSERT INTO schema_migrations (id) VALUES (?)", [file]);
    console.log(`Migracion aplicada en Aiven: ${file}`);
  }
}

function versionSort(a, b) {
  const left = Number(a.match(/^V(\d+)/i)?.[1] || 0);
  const right = Number(b.match(/^V(\d+)/i)?.[1] || 0);
  return left - right || a.localeCompare(b);
}

function migrationVersion(file) {
  return file.match(/^V(\d+)__/i)?.[1] || null;
}

async function listTables(conn) {
  const [rows] = await conn.query(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  return rows.map(row => row.tableName);
}

async function tableCounts(conn, tables) {
  const counts = new Map();
  for (const table of tables) {
    const [rows] = await conn.query(`SELECT COUNT(*) AS total FROM ${qid(table)}`);
    counts.set(table, Number(rows[0]?.total || 0));
  }
  return counts;
}

function printCounts(label, counts) {
  const totalRows = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const nonEmpty = [...counts.values()].filter(Boolean).length;
  console.log("");
  console.log(`${label}: tablas=${counts.size}; tablas_con_datos=${nonEmpty}; registros=${totalRows}`);
  for (const [table, total] of counts) {
    if (total > 0 || ["clientes", "piezas", "remisiones", "users", "schema_migrations"].includes(table)) {
      console.log(`  ${table}: ${total}`);
    }
  }
}

async function replaceData(source, destination, tables) {
  console.log("");
  console.log("Reemplazando datos en Aiven con la copia local...");
  await destination.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const table of [...tables].reverse()) {
      await clearTable(destination, table);
    }

    for (const table of tables) {
      await copyTable(source, destination, table);
    }
  } finally {
    await destination.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

async function clearTable(conn, table) {
  try {
    await conn.query(`TRUNCATE TABLE ${qid(table)}`);
  } catch {
    await conn.query(`DELETE FROM ${qid(table)}`);
  }
}

async function copyTable(source, destination, table) {
  const columns = await tableColumns(source, table);
  const selectSql = `SELECT ${columns.map(qid).join(", ")} FROM ${qid(table)}`;
  const [rows] = await source.query(selectSql);
  if (!rows.length) {
    console.log(`  ${table}: 0`);
    return;
  }

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const values = batch.map(row => columns.map(column => row[column]));
    const placeholders = values.map(row => `(${row.map(() => "?").join(", ")})`).join(", ");
    const sql = `INSERT INTO ${qid(table)} (${columns.map(qid).join(", ")}) VALUES ${placeholders}`;
    await destination.query(sql, values.flat());
  }
  console.log(`  ${table}: ${rows.length}`);
}

async function tableColumns(conn, table) {
  const [rows] = await conn.query(
    `SELECT column_name AS columnName
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
      ORDER BY ordinal_position`,
    [table]
  );
  return rows.map(row => row.columnName);
}

function assertCountsMatch(expected, actual) {
  const mismatches = [];
  for (const [table, total] of expected) {
    if (actual.get(table) !== total) {
      mismatches.push(`${table}: local=${total}, aiven=${actual.get(table)}`);
    }
  }
  if (mismatches.length) {
    throw new Error(`La copia termino con diferencias: ${mismatches.join("; ")}`);
  }
}

function qid(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

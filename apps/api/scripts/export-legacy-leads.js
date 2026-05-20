const { PrismaClient } = require("@prisma/client");
const { createHash } = require("crypto");
const { mkdir, writeFile } = require("fs/promises");
const path = require("path");

const prisma = new PrismaClient();
const legacyTables = ["Lead", "LeadActivity", "LeadAttachment", "LeadNote", "LeadTask"];

function schemaName() {
  if (!process.env.DATABASE_URL) {
    return "public";
  }

  const url = new URL(process.env.DATABASE_URL);
  return url.searchParams.get("schema") || "public";
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function backupTimestamp() {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "").replaceAll("-", "");
}

function repoRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}

function backupDirFromArgs() {
  const outIndex = process.argv.indexOf("--out");
  if (outIndex !== -1) {
    const value = process.argv[outIndex + 1];

    if (!value) {
      throw new Error("--out requires a directory path.");
    }

    return path.resolve(value);
  }

  if (process.env.PULSE_LEGACY_LEAD_BACKUP_DIR) {
    return path.resolve(process.env.PULSE_LEGACY_LEAD_BACKUP_DIR);
  }

  return path.join(repoRoot(), "database", "local-backups", "legacy-leads", backupTimestamp());
}

function normalize(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === "object") {
    if (typeof value.toJSON === "function") {
      return value.toJSON();
    }

    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  }

  return value;
}

function serialize(data) {
  return `${JSON.stringify(normalize(data), null, 2)}\n`;
}

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

function redactDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const url = new URL(process.env.DATABASE_URL);

  if (url.password) {
    url.password = "REDACTED";
  }

  return url.toString();
}

async function tableExists(schema, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = ${schema}
        AND table_name = ${tableName}
    ) AS "exists"
  `;

  return rows[0]?.exists === true;
}

async function tableColumns(schema, tableName) {
  return prisma.$queryRaw`
    SELECT column_name AS "name", data_type AS "type"
    FROM information_schema.columns
    WHERE table_schema = ${schema}
      AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;
}

async function exportTable(schema, tableName, outputDir) {
  if (!(await tableExists(schema, tableName))) {
    throw new Error(`Missing legacy table ${schema}.${tableName}. Export before applying the new schema.`);
  }

  const qualifiedTable = `${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM ${qualifiedTable} ORDER BY "createdAt" ASC, "id" ASC`
  );
  const columns = await tableColumns(schema, tableName);
  const content = serialize(rows);
  const fileName = `${tableName}.json`;

  await writeFile(path.join(outputDir, fileName), content, "utf8");

  return {
    file: fileName,
    count: rows.length,
    checksumSha256: checksum(content),
    columns
  };
}

async function main() {
  const schema = schemaName();
  const outputDir = backupDirFromArgs();
  const exportedAt = new Date().toISOString();
  const manifest = {
    exportedAt,
    databaseUrl: redactDatabaseUrl(),
    schema,
    tables: {}
  };

  await mkdir(outputDir, { recursive: true });

  for (const tableName of legacyTables) {
    manifest.tables[tableName] = await exportTable(schema, tableName, outputDir);
  }

  const manifestContent = serialize(manifest);
  await writeFile(path.join(outputDir, "manifest.json"), manifestContent, "utf8");

  console.log(`Exported legacy Lead data to ${outputDir}`);
  for (const tableName of legacyTables) {
    console.log(`${tableName}: ${manifest.tables[tableName].count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

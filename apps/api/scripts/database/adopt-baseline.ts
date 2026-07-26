import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

const baselineName = "202607210001_pulse_0_1_baseline";
const apply = process.argv.includes("--apply");
const baselineFile = resolve(process.cwd(), "prisma", "migrations", baselineName, "migration.sql");
const baselineSql = readFileSync(baselineFile, "utf8");

function sorted(values: Iterable<string>) {
  return [...new Set(values)].sort();
}

function difference(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function expectedCatalog() {
  const tables = new Map<string, string[]>();
  const constraints: string[] = [];
  const primaryIndexes: string[] = [];
  for (const match of baselineSql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)) {
    const [, table, body] = match;
    tables.set(table, sorted([...body.matchAll(/^\s+"([^"]+)"/gm)].map((column) => column[1])));
    const tableConstraints = [...body.matchAll(/CONSTRAINT "([^"]+)"/g)].map((constraint) => constraint[1]);
    constraints.push(...tableConstraints);
    primaryIndexes.push(...tableConstraints.filter((constraint) => constraint.endsWith("_pkey")));
  }
  const indexes = [
    ...primaryIndexes,
    ...[...baselineSql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map((match) => match[1])
  ];
  constraints.push(...[...baselineSql.matchAll(/ADD CONSTRAINT "([^"]+)"/g)].map((match) => match[1]));
  return { tables, indexes: sorted(indexes), constraints: sorted(constraints) };
}

function redact(message: string) {
  const databaseUrl = process.env.DATABASE_URL;
  return databaseUrl ? message.replaceAll(databaseUrl, "[database-url]") : message;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const expected = expectedCatalog();
    const ledger = await pool.query<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM pulse._prisma_migrations
      ORDER BY started_at
    `).catch((error: NodeJS.ErrnoException) => {
      if (String(error.message).includes("_prisma_migrations")) return { rows: [] };
      throw error;
    });
    const appliedBaseline = ledger.rows.some((row) =>
      row.migration_name === baselineName && row.finished_at && !row.rolled_back_at
    );
    if (ledger.rows.length && !appliedBaseline) {
      throw new Error("A Prisma migration ledger exists without the Pulse 0.1 baseline; manual review is required.");
    }

    const tableRows = await pool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'pulse' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `);
    const columnRows = await pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'pulse' AND table_name <> '_prisma_migrations'
      ORDER BY table_name, ordinal_position
    `);
    const indexRows = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'pulse' ORDER BY indexname
    `);
    const constraintRows = await pool.query<{ conname: string }>(`
      SELECT conname FROM pg_constraint WHERE connamespace = 'pulse'::regnamespace ORDER BY conname
    `);

    const actualTables = sorted(tableRows.rows.map((row) => row.table_name));
    const expectedTables = sorted(expected.tables.keys());
    const expectedColumns = sorted([...expected.tables].flatMap(([table, columns]) => columns.map((column) => `${table}.${column}`)));
    const actualColumns = sorted(columnRows.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const allowedExtraIndexes = new Set(["Request_currentStepId_key"]);
    const allowedExtraConstraints = new Set(["Request_currentStepId_fkey"]);
    const actualIndexes = sorted(indexRows.rows.map((row) => row.indexname).filter((name) => !allowedExtraIndexes.has(name)));
    const actualConstraints = sorted(constraintRows.rows.map((row) => row.conname).filter((name) => !allowedExtraConstraints.has(name)));
    const mismatches = {
      missingTables: difference(expectedTables, actualTables),
      unexpectedTables: difference(actualTables, expectedTables),
      missingColumns: difference(expectedColumns, actualColumns),
      unexpectedColumns: difference(actualColumns, expectedColumns),
      missingIndexes: difference(expected.indexes, actualIndexes),
      unexpectedIndexes: difference(actualIndexes, expected.indexes),
      missingConstraints: difference(expected.constraints, actualConstraints),
      unexpectedConstraints: difference(actualConstraints, expected.constraints)
    };
    const compatible = Object.values(mismatches).every((items) => items.length === 0);
    const preservedTables = [
      "Client", "PointOfContact", "ClientSite", "Request", "RequestUpdate", "Quote", "QuoteItem",
      "QuoteRevision", "Item", "ItemPriceHistory", "Project", "Invoice", "LifecycleDocument", "LifecycleStatusEvent"
    ];
    const rowCounts: Record<string, number> = {};
    for (const table of preservedTables) {
      const result = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM pulse."${table}"`);
      rowCounts[table] = Number(result.rows[0]?.count ?? 0);
    }

    console.log(JSON.stringify({
      mode: apply ? "APPLY" : "PREVIEW",
      baseline: baselineName,
      status: appliedBaseline ? "already-adopted" : compatible ? "ready-to-adopt" : "incompatible",
      allowedLegacyDrift: {
        indexes: indexRows.rows.some((row) => row.indexname === "Request_currentStepId_key") ? ["Request_currentStepId_key"] : [],
        constraints: constraintRows.rows.some((row) => row.conname === "Request_currentStepId_fkey") ? ["Request_currentStepId_fkey"] : []
      },
      mismatches,
      preservedRowCounts: rowCounts
    }, null, 2));

    if (!compatible) throw new Error("Baseline adoption refused because the live catalog does not match the validated pre-0.1 schema.");
    if (!apply || appliedBaseline) return;
    const result = spawnSync(
      "npm",
      ["exec", "prisma", "--", "migrate", "resolve", "--applied", baselineName],
      { cwd: process.cwd(), env: process.env, encoding: "utf8" }
    );
    if (result.status !== 0) {
      throw new Error(`Prisma baseline resolution failed: ${redact(result.stderr || result.stdout || "unknown error")}`);
    }
    console.log("Pulse 0.1 baseline recorded as applied. No historical migration was replayed.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : "Baseline adoption failed."));
  process.exitCode = 1;
});

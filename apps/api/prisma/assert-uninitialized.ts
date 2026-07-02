import "dotenv/config";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to initialize Pulse.");
}

const connectionUrl = new URL(databaseUrl);
connectionUrl.searchParams.delete("schema");
const pool = new Pool({ connectionString: connectionUrl.toString() });

async function main() {
  const result = await pool.query<{ initialized: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'pulse'
        AND table_type = 'BASE TABLE'
    ) AS initialized
  `);

  if (result.rows[0]?.initialized) {
    console.error(
      [
        "Pulse is already initialized; refusing to run the first-run seed.",
        "No users, documents, or application records were changed.",
        "Use the normal Docker startup command instead: docker compose up -d --build",
        "Only run npm run db:reset-demo when an intentional destructive reset was specifically requested."
      ].join("\n")
    );
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

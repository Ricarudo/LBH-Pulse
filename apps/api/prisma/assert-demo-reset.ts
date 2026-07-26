import "dotenv/config";

function refuse(message: string): never {
  throw new Error(`Demo reset refused: ${message}`);
}

if (process.env.NODE_ENV !== "development") {
  refuse("NODE_ENV must be development.");
}
if (process.env.PULSE_ENABLE_DEMO_SEED !== "1" || process.env.PULSE_ALLOW_DESTRUCTIVE_SEED !== "1") {
  refuse("PULSE_ENABLE_DEMO_SEED and PULSE_ALLOW_DESTRUCTIVE_SEED must both equal 1.");
}
if (process.env.PULSE_ALLOW_DEMO_RESET !== "I_UNDERSTAND_THIS_DELETES_DISPOSABLE_DATA") {
  refuse("the one-time destructive acknowledgement is missing.");
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) refuse("DATABASE_URL is missing.");
let databaseName = "";
try {
  databaseName = decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, ""));
} catch {
  refuse("DATABASE_URL is invalid.");
}
if (!databaseName || process.env.PULSE_DEMO_RESET_DATABASE !== databaseName) {
  refuse("PULSE_DEMO_RESET_DATABASE must exactly match the target database name.");
}

console.log(`Disposable development reset authorized for database ${databaseName}.`);

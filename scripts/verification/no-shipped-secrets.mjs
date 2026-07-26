import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// SHA-256 digests let the release gate detect the retired values without
// re-publishing them in source or logs.
const prohibitedDigests = new Set([
  "209e224172646bbf2b521816560bcc9f494933a55fd15d81801d801da74fabfd",
  "cc07219d70db3a755853e7678b6b9e51ee87a606152638bfb4ad9e4b3592ee05",
  "c15072677b7a0a1f7dd5bb0bedba1f2270096984bc28d0e406ab99a5104f2c54",
  "bf60e1de3147fe42b7d9415b27be6b2b2d79a4ec633675ae582968f7b3aa0f52",
  "2a21f3c8657bbb7e8e0630af028e7335029252fd2c19ba5080f934148e2cfbc7",
  "7aee1b6b5c8814534a33dd56ef6b592662188690e1fd1a9752837c97f811d3d2",
  "6dd70685a4e5f51d4a55f4fd7c95891d9df4bd5aefa391f5dee4c53c866d4407",
  "5c2eb475f237efa59ecfbc1d0eb5da3bf0c780750d8dbbb8447d53d315ddd835",
  "9b01281b48af547aaaa07fb654777b4506fd211f8a3abd6c0dcc78a1993ca442"
]);

const listed = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  encoding: "buffer",
  maxBuffer: 32 * 1024 * 1024
});
function filesystemFiles(directory = ".") {
  const collected = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
    const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) collected.push(...filesystemFiles(path));
    else if (entry.isFile()) collected.push(path);
  }
  return collected;
}
const files = listed.status === 0
  ? listed.stdout.toString("utf8").split("\0").filter(Boolean)
  : filesystemFiles();
const failures = [];
for (const file of files) {
  let content;
  try {
    const buffer = readFileSync(file);
    if (buffer.length > 4 * 1024 * 1024 || buffer.includes(0)) continue;
    content = buffer.toString("utf8");
  } catch {
    continue;
  }
  const tokens = content.match(/[A-Za-z0-9_!.:-]{8,}/g) || [];
  if (tokens.some((token) => prohibitedDigests.has(createHash("sha256").update(token).digest("hex")))) {
    failures.push(`${file}: contains a retired credential or secret value`);
  }
}

const authService = readFileSync("apps/api/src/shared/auth.service.ts", "utf8");
if (/PULSE_SESSION_SECRET[^\n]*(?:\|\||\?\?)[^\n]*["']/m.test(authService)) {
  failures.push("apps/api/src/shared/auth.service.ts: contains a session-secret fallback");
}
const seed = readFileSync("apps/api/prisma/seed.ts", "utf8");
if (/password\s*:\s*["'][^"']+["']/i.test(seed)) {
  failures.push("apps/api/prisma/seed.ts: contains a literal seeded password");
}
const apiPackage = JSON.parse(readFileSync("apps/api/package.json", "utf8"));
if (!String(apiPackage.scripts?.["db:reset:demo"] || "").startsWith("tsx prisma/assert-demo-reset.ts &&")) {
  failures.push("apps/api/package.json: demo reset is missing its pre-reset production guard");
}

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  throw new Error("Shipped credential prevention gate failed.");
}
console.log("Shipped credential and insecure session-fallback prevention gate passed.");

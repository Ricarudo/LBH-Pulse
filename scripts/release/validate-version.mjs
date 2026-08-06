import { readFileSync } from "node:fs";

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || "";
const match = /^v(\d+\.\d+\.\d+)$/.exec(tag);
if (!match) throw new Error(`Release tag must match v<major>.<minor>.<patch>; received ${tag || "nothing"}.`);

const packageFiles = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json"
];
const packageVersions = packageFiles.map((path) => ({
  path,
  version: JSON.parse(readFileSync(path, "utf8")).version
}));
const packageVersion = packageVersions[0].version;
if (match[1] !== packageVersion) {
  throw new Error(`Release tag ${tag} does not match package.json version ${packageVersion}.`);
}
for (const entry of packageVersions) {
  if (entry.version !== packageVersion) {
    throw new Error(`${entry.path} version ${entry.version} does not match release version ${packageVersion}.`);
  }
}

const [major, minor] = packageVersion.split(".");
process.stdout.write(JSON.stringify({ tag, version: packageVersion, minor: `${major}.${minor}` }));

import { readFileSync } from "node:fs";

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || "";
const match = /^v(\d+\.\d+\.\d+)$/.exec(tag);
if (!match) throw new Error(`Release tag must match v<major>.<minor>.<patch>; received ${tag || "nothing"}.`);

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
if (match[1] !== packageVersion) {
  throw new Error(`Release tag ${tag} does not match package.json version ${packageVersion}.`);
}

const [major, minor] = packageVersion.split(".");
process.stdout.write(JSON.stringify({ tag, version: packageVersion, minor: `${major}.${minor}` }));

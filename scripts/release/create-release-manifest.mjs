import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const version = args.get("--version");
const commit = args.get("--commit");
const input = resolve(args.get("--input") || "release-digests");
const output = resolve(args.get("--output") || "release-bundle");
const buildBasesPath = args.get("--build-bases");
if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("A semantic --version is required.");
if (!/^[a-f0-9]{40}$/.test(commit || "")) throw new Error("A full lowercase --commit SHA is required.");

const required = [
  "api", "web", "maintenance", "minioInit", "clamav", "backupCrypto",
  "gatewayInternal", "gatewayPublic", "postgres", "minio", "minioMc"
];
const images = {};
for (const filename of readdirSync(input).filter((name) => name.endsWith(".json") && name !== "build-bases.json").sort()) {
  const entry = JSON.parse(readFileSync(resolve(input, filename), "utf8"));
  if (!required.includes(entry.component)) throw new Error(`Unexpected release component ${entry.component}.`);
  if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(entry.reference) &&
      !/^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(entry.reference)) {
    throw new Error(`Component ${entry.component} is not pinned by sha256 digest.`);
  }
  if (images[entry.component]) throw new Error(`Duplicate release component ${entry.component}.`);
  images[entry.component] = entry.reference;
}

const buildBases = buildBasesPath
  ? JSON.parse(readFileSync(resolve(buildBasesPath), "utf8"))
  : {};
for (const [name, reference] of Object.entries(buildBases)) {
  if (!/^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(reference)) {
    throw new Error(`Build base ${name} is not pinned by sha256 digest.`);
  }
}
for (const component of required) {
  if (!images[component]) throw new Error(`Missing release component ${component}.`);
}

mkdirSync(output, { recursive: true });
const manifest = {
  schemaVersion: 1,
  product: "Pulse",
  version,
  tag: `v${version}`,
  commit,
  platform: "linux/amd64",
  buildBases: Object.fromEntries(Object.entries(buildBases).sort(([left], [right]) => left.localeCompare(right))),
  images: Object.fromEntries(Object.entries(images).sort(([left], [right]) => left.localeCompare(right)))
};
writeFileSync(resolve(output, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Created digest-pinned Pulse ${version} release manifest.`);

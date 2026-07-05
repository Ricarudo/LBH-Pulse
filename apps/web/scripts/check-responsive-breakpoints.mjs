import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourceRoot = path.resolve(process.cwd(), "src");
const allowedWidths = new Set([
  "639",
  "640",
  "767",
  "768",
  "1023",
  "1024",
  "1279",
  "1280",
  "1535",
  "1536"
]);

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return cssFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".css") ? [entryPath] : [];
    })
  );
  return files.flat();
}

const failures = [];

for (const file of await cssFiles(sourceRoot)) {
  const content = await readFile(file, "utf8");
  const lines = content.split("\n");

  for (const [index, lineContent] of lines.entries()) {
    if (!lineContent.includes("@media")) continue;

    const widthRule = /(?:min|max)-width:\s*(\d+)px/g;
    for (const match of lineContent.matchAll(widthRule)) {
      if (allowedWidths.has(match[1])) continue;
      failures.push(
        `${path.relative(process.cwd(), file)}:${index + 1} uses ${match[0]}`
      );
    }
  }
}

if (failures.length) {
  console.error("Noncanonical responsive breakpoints found:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("Use the responsive tiers documented in docs/RESPONSIVE_DESIGN.md.");
  process.exitCode = 1;
} else {
  console.log("Responsive breakpoints follow the project standard.");
}

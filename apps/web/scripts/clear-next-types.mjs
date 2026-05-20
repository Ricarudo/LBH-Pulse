import { rmSync } from "node:fs";
import { join } from "node:path";

const generatedTypeDirs = [
  join(".next", "types"),
  join(".next", "dev", "types")
];

for (const dir of generatedTypeDirs) {
  rmSync(dir, { recursive: true, force: true });
}

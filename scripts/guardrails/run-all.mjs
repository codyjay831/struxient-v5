#!/usr/bin/env node
/**
 * Guardrails v1 — run all architecture drift checks.
 * Add new scripts here as Pass 2+ checks are implemented.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHECKS = [
  { name: "schema", file: "detect-schema-changes.mjs" },
];

console.log("Struxient guardrails v1\n");

let failed = false;

for (const check of CHECKS) {
  console.log(`→ ${check.name}`);
  const scriptPath = path.join(__dirname, check.file);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    failed = true;
  }
  console.log("");
}

if (failed) {
  console.error("Guardrails failed.");
  process.exit(1);
}

console.log("All guardrails passed.");

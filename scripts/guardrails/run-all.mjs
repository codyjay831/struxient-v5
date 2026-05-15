#!/usr/bin/env node
/**
 * Guardrails — schema gate (fail) + drift detectors (warn by default).
 *
 * GUARDRAILS_STRICT=1 — drift warnings fail the run (for CI tightening later).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHECKS = [
  { name: "schema", file: "detect-schema-changes.mjs", strict: true },
  { name: "deprecated-tag-count-fields", file: "detect-deprecated-tag-count-fields.mjs", strict: true },
  { name: "payment-status-drift", file: "detect-payment-status-drift.mjs", strict: false },
  { name: "task-readiness-drift", file: "detect-task-readiness-drift.mjs", strict: false },
  { name: "raw-palette", file: "detect-raw-palette.mjs", strict: false },
  { name: "corrections-constant", file: "detect-corrections-constant-drift.mjs", strict: false },
  { name: "client-db-import", file: "detect-client-db-import.mjs", strict: false },
];

const strictAll = process.env.GUARDRAILS_STRICT === "1";

console.log("Struxient guardrails\n");
if (strictAll) {
  console.log("(GUARDRAILS_STRICT=1 — drift warnings will fail the run)\n");
}

let failed = false;

for (const check of CHECKS) {
  console.log(`→ ${check.name}`);
  const scriptPath = path.join(__dirname, check.file);
  const env = { ...process.env };
  if (strictAll && !check.strict) {
    env.GUARDRAILS_STRICT = "1";
  }
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    env,
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

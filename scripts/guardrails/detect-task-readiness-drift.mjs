#!/usr/bin/env node
/**
 * Warn when deriveTaskState / toTaskReadinessInput appear without importing task-readiness.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkSourceFiles } from "./lib/scan-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOT = path.join(REPO_ROOT, "apps/web/src");

const DERIVE_RE = /\bderiveTaskState\s*\(/;
const TO_INPUT_RE = /\btoTaskReadinessInput\s*\(/;
const IMPORT_RE = /["']@\/lib\/task-readiness["']|["']\.\/task-readiness["']|["']\.\.\/.*task-readiness["']/;

/** Files that may reference readiness types without calling derive (e.g. types only) */
const ALLOWLIST_FULL = new Set([
  "apps/web/src/lib/task-readiness.ts",
  "apps/web/src/lib/task-readiness.test.ts",
  "apps/web/src/lib/job-execution-health.ts",
  "apps/web/src/lib/job-execution-health.test.ts",
]);

function toPosix(p) {
  return p.split(path.sep).join("/");
}

const warnings = [];

walkSourceFiles(SCAN_ROOT, (absPath, content) => {
  const rel = toPosix(path.relative(REPO_ROOT, absPath));
  if (ALLOWLIST_FULL.has(rel)) return;

  const usesDerive = DERIVE_RE.test(content) || TO_INPUT_RE.test(content);
  if (!usesDerive) return;

  if (!IMPORT_RE.test(content)) {
    warnings.push(
      `${rel}: uses deriveTaskState/toTaskReadinessInput but no import from task-readiness (check path alias)`,
    );
  }
});

const strict = process.env.GUARDRAILS_STRICT === "1";
const unique = [...new Set(warnings)];

if (unique.length === 0) {
  console.log("✓ task-readiness-drift — no findings");
  process.exit(0);
}

console.error(`⚠ task-readiness-drift — ${unique.length} finding(s)\n`);
for (const w of unique) console.error(`  ${w}`);
console.error("");

if (strict) {
  console.error("GUARDRAILS_STRICT=1 — treating warnings as failure.");
  process.exit(1);
}
process.exit(0);

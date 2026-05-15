#!/usr/bin/env node
/**
 * Warn when the corrections stage name is duplicated as a string literal
 * instead of importing CORRECTIONS_STAGE_NAME from job-payment-readiness.ts.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkSourceFiles } from "./lib/scan-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOT = path.join(REPO_ROOT, "apps/web/src");

const LITERAL_RE = /["']Corrections["']/;

const ALLOWLIST_FULL = new Set(["apps/web/src/lib/job-payment-readiness.ts"]);

function toPosix(p) {
  return p.split(path.sep).join("/");
}

const warnings = [];

walkSourceFiles(SCAN_ROOT, (absPath, content) => {
  const rel = toPosix(path.relative(REPO_ROOT, absPath));
  if (ALLOWLIST_FULL.has(rel)) return;
  if (!LITERAL_RE.test(content)) return;
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) return;
    if (!LITERAL_RE.test(line)) return;
    warnings.push(
      `${rel}:${i + 1}: literal "Corrections" — import CORRECTIONS_STAGE_NAME from @/lib/job-payment-readiness`,
    );
  });
});

const strict = process.env.GUARDRAILS_STRICT === "1";
const unique = [...new Set(warnings)];

if (unique.length === 0) {
  console.log("✓ corrections-constant — no duplicate literals");
  process.exit(0);
}

console.error(`⚠ corrections-constant — ${unique.length} finding(s)\n`);
for (const w of unique) console.error(`  ${w}`);
console.error("");

if (strict) {
  console.error("GUARDRAILS_STRICT=1 — treating warnings as failure.");
  process.exit(1);
}
process.exit(0);

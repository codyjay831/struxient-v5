#!/usr/bin/env node
/**
 * Warn on raw string comparisons for JobPaymentRequirement-style statuses
 * outside canonical payment modules (prefer enums + isPaymentEffectivelyDue).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkSourceFiles } from "./lib/scan-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOT = path.join(REPO_ROOT, "apps/web/src");

/** Paths relative to repo root — allowed to use string status literals for display/query narrowing */
const ALLOWLIST_PREFIXES = [
  "apps/web/src/lib/job-payment-readiness.ts",
  "apps/web/src/lib/job-payment-readiness.test.ts",
  "apps/web/src/lib/job-payment-display.ts",
];

const STATUS_STRING_RE =
  /\.status\s*===\s*["'](?:DUE|PENDING|PAID|WAIVED|CANCELED)["']|["'](?:DUE|PENDING|PAID|WAIVED|CANCELED)["']\s*===\s*\w+\.status/;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function isAllowlisted(absPath) {
  const rel = toPosix(path.relative(REPO_ROOT, absPath));
  return ALLOWLIST_PREFIXES.some((p) => rel === p || rel.startsWith(p + "/"));
}

const warnings = [];

walkSourceFiles(SCAN_ROOT, (absPath, content) => {
  if (isAllowlisted(absPath)) return;
  const rel = toPosix(path.relative(REPO_ROOT, absPath));
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (!STATUS_STRING_RE.test(line)) return;
    warnings.push(`${rel}:${i + 1}: raw payment status string compare — prefer JobPaymentRequirementStatus + job-payment-readiness helpers where operational`);
  });
});

const strict = process.env.GUARDRAILS_STRICT === "1";

if (warnings.length === 0) {
  console.log("✓ payment-status-drift — no findings outside allowlist");
  process.exit(0);
}

console.error(`⚠ payment-status-drift — ${warnings.length} finding(s)\n`);
for (const w of warnings) console.error(`  ${w}`);
console.error("");

if (strict) {
  console.error("GUARDRAILS_STRICT=1 — treating warnings as failure.");
  process.exit(1);
}
process.exit(0);

#!/usr/bin/env node
/**
 * Fail if application code references deprecated Tag usage count fields
 * (schema columns are unused; counts come from Prisma _count).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkSourceFiles } from "./lib/scan-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOT = path.join(REPO_ROOT, "apps/web/src");

const FIELD_RE = /\busageCountLineItems\b|\busageCountTasks\b/;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

const violations = [];

walkSourceFiles(SCAN_ROOT, (absPath, content) => {
  const rel = toPosix(path.relative(REPO_ROOT, absPath));
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) return;
    if (!FIELD_RE.test(line)) return;
    violations.push(`${rel}:${i + 1}: deprecated Tag count field reference — use relation _count, not stored counters`);
  });
});

if (violations.length === 0) {
  console.log("✓ deprecated-tag-count-fields — no references in src");
  process.exit(0);
}

console.error(`✗ deprecated-tag-count-fields — ${violations.length} violation(s)\n`);
for (const v of violations) console.error(`  ${v}`);
console.error("");
process.exit(1);

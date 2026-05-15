#!/usr/bin/env node
/**
 * Warn when "use client" modules import server-only DB entrypoints.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkSourceFiles } from "./lib/scan-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOT = path.join(REPO_ROOT, "apps/web/src");

const USE_CLIENT = /^["']use client["'];?\s*$/m;
const DB_IMPORT_RE =
  /from\s+["']@\/lib\/db["']|from\s+["']@\/lib\/db\.ts["']|from\s+["']\.\.\/lib\/db["']|from\s+["']\.\/db["']/;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

const warnings = [];

walkSourceFiles(SCAN_ROOT, (absPath, content) => {
  if (!absPath.endsWith(".tsx") && !absPath.endsWith(".ts")) return;
  const rel = toPosix(path.relative(REPO_ROOT, absPath));
  const head = content.slice(0, 4000);
  if (!USE_CLIENT.test(head)) return;
  if (!DB_IMPORT_RE.test(content)) return;
  warnings.push(`${rel}: "use client" file imports db — keep data loading in server components / actions`);
});

const strict = process.env.GUARDRAILS_STRICT === "1";

if (warnings.length === 0) {
  console.log("✓ client-db-import — no use client + @/lib/db imports");
  process.exit(0);
}

console.error(`⚠ client-db-import — ${warnings.length} finding(s)\n`);
for (const w of warnings) console.error(`  ${w}`);
console.error("");

if (strict) {
  console.error("GUARDRAILS_STRICT=1 — treating warnings as failure.");
  process.exit(1);
}
process.exit(0);

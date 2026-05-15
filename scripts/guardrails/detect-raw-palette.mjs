#!/usr/bin/env node
/**
 * Warn on raw Tailwind palette utilities (zinc/gray/slate) — prefer semantic tokens (globals.css).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkSourceFiles } from "./lib/scan-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOT = path.join(REPO_ROOT, "apps/web/src");

/** Tailwind-style palette + shade */
const PALETTE_RE = /\b(?:zinc|gray|slate)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

const warnings = [];

walkSourceFiles(SCAN_ROOT, (absPath, content) => {
  const rel = toPosix(path.relative(REPO_ROOT, absPath));
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) return;
    if (!PALETTE_RE.test(line)) return;
    warnings.push(`${rel}:${i + 1}: raw palette class — use semantic tokens (e.g. foreground-muted, border-border)`);
  });
});

const strict = process.env.GUARDRAILS_STRICT === "1";

if (warnings.length === 0) {
  console.log("✓ raw-palette — no zinc/gray/slate utility classes in src");
  process.exit(0);
}

console.error(`⚠ raw-palette — ${warnings.length} finding(s)\n`);
for (const w of warnings) console.error(`  ${w}`);
console.error("");

if (strict) {
  console.error("GUARDRAILS_STRICT=1 — treating warnings as failure.");
  process.exit(1);
}
process.exit(0);

#!/usr/bin/env node
/**
 * Fail when Change Order server action modules export types.
 * Type exports in "use server" files can become runtime references under Turbopack.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const CHANGE_ORDER_SERVER_ACTION_FILES = [
  "apps/web/src/app/(workspace)/change-orders/change-order-actions.ts",
  "apps/web/src/app/(workspace)/quotes/quote-scope-revision-actions.ts",
  "apps/web/src/app/co/[token]/change-order-share-actions.ts",
];

const USE_SERVER_RE = /^\s*["']use server["'];?\s*$/m;
const EXPORT_TYPE_RE = /^\s*export\s+type\b/m;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

const violations = [];

for (const rel of CHANGE_ORDER_SERVER_ACTION_FILES) {
  const absPath = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(absPath)) {
    violations.push(`${rel}: missing Change Order server action file`);
    continue;
  }
  const content = fs.readFileSync(absPath, "utf8");
  if (!USE_SERVER_RE.test(content)) {
    violations.push(`${rel}: expected "use server" directive`);
    continue;
  }
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (EXPORT_TYPE_RE.test(line)) {
      violations.push(
        `${rel}:${index + 1}: server action modules must not export types — move to src/lib or a *-types.ts file`,
      );
    }
  });
}

if (violations.length === 0) {
  console.log("✓ change-order server actions — no exported types in use server modules");
  process.exit(0);
}

console.error(`✗ change-order server actions — ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  ${v}`);
}
console.error(
  "\nShared types belong in src/lib/... or a sibling *-types.ts file, not in server action modules.",
);
process.exit(1);

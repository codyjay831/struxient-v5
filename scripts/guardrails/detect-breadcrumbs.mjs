#!/usr/bin/env node
/**
 * Fail if WorkspaceBreadcrumb is imported — breadcrumbs are banned (workspace-ux-canon §No breadcrumbs).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkSourceFiles } from "./lib/scan-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOT = path.join(REPO_ROOT, "apps/web/src");

const BREADCRUMB_IMPORT_RE =
  /from\s+["']@\/components\/ui\/workspace-breadcrumb["']|from\s+["'].*workspace-breadcrumb["']/;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

const violations = [];

walkSourceFiles(SCAN_ROOT, (absPath, content) => {
  const rel = toPosix(path.relative(REPO_ROOT, absPath));
  if (rel.endsWith("workspace-breadcrumb.tsx")) {
    return;
  }
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (BREADCRUMB_IMPORT_RE.test(line)) {
      violations.push(
        `${rel}:${i + 1}: breadcrumbs are banned — use sidebar, module nav, page title, and PageBackLink`,
      );
    }
  });
});

if (violations.length === 0) {
  console.log("✓ breadcrumbs — no WorkspaceBreadcrumb imports in src");
  process.exit(0);
}

console.error(`✗ breadcrumbs — ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  ${v}`);
}
console.error("\nSee docs/canon/workspace-ux-canon.md §No breadcrumbs.");
process.exit(1);

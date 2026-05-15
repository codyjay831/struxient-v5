#!/usr/bin/env node
/**
 * Fails if apps/web/prisma/schema.prisma has uncommitted changes
 * unless ALLOW_SCHEMA=1 is set (explicit schema-change approval).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCHEMA_REL = "apps/web/prisma/schema.prisma";

function gitOutput(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

const allowSchema = process.env.ALLOW_SCHEMA === "1";

// Working tree + staged changes for schema.prisma
const porcelain = gitOutput(`status --porcelain -- ${SCHEMA_REL}`);
const hasChanges = porcelain.length > 0;

if (!hasChanges) {
  console.log(`✓ ${SCHEMA_REL} — no uncommitted changes`);
  process.exit(0);
}

if (allowSchema) {
  console.log(`⚠ ${SCHEMA_REL} has uncommitted changes (ALLOW_SCHEMA=1 — bypassing)`);
  for (const line of porcelain.split("\n")) {
    console.log(`  ${line}`);
  }
  process.exit(0);
}

console.error(`✗ ${SCHEMA_REL} has uncommitted changes.`);
console.error("");
console.error("  Schema changes require explicit approval.");
console.error("  See docs/architecture-guardrails.md and .cursor/rules/no-schema-without-approval.mdc");
console.error("");
console.error("  To bypass intentionally:");
console.error("    ALLOW_SCHEMA=1 npm run guardrails");
console.error("");
for (const line of porcelain.split("\n")) {
  console.error(`  ${line}`);
}
process.exit(1);

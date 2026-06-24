import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../..");

const CHANGE_ORDER_SERVER_ACTION_FILES = [
  "apps/web/src/app/(workspace)/change-orders/change-order-actions.ts",
  "apps/web/src/app/(workspace)/quotes/quote-scope-revision-actions.ts",
  "apps/web/src/app/co/[token]/change-order-share-actions.ts",
];

const USE_SERVER_RE = /^\s*["']use server["'];?\s*$/m;
const EXPORT_TYPE_RE = /^\s*export\s+type\b/m;

test("Change Order server action modules do not export types", () => {
  const violations: string[] = [];

  for (const rel of CHANGE_ORDER_SERVER_ACTION_FILES) {
    const absPath = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(absPath), `missing ${rel}`);
    const content = fs.readFileSync(absPath, "utf8");
    assert.match(content, USE_SERVER_RE, `${rel} must be a use server module`);
    for (const [index, line] of content.split("\n").entries()) {
      if (EXPORT_TYPE_RE.test(line)) {
        violations.push(`${rel}:${index + 1}`);
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `exported types in Change Order server action modules:\n${violations.join("\n")}`,
  );
});

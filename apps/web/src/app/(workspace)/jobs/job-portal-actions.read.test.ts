import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const jobPortalActionsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "job-portal-actions.ts",
);
const jobPagePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "[jobId]",
  "page.tsx",
);
const portalActionsSource = readFileSync(jobPortalActionsPath, "utf8");
const jobPageSource = readFileSync(jobPagePath, "utf8");

assert.match(
  portalActionsSource,
  /canReadCustomerCoordination\(ctx\.role\)/,
  "loadJobPortalManagementData should gate on canReadCustomerCoordination",
);

assert.match(
  jobPageSource,
  /canReadCustomerCoordination\(ctx\.role\)/,
  "job detail page should gate customer portal loading/rendering",
);

assert.match(
  jobPageSource,
  /customerCoordinationReadable \? loadJobPortalManagementData/,
  "job detail page should skip portal loader for non-coordination roles",
);

assert.doesNotMatch(
  jobPageSource,
  /loadJobPortalManagementData\(id\),\s*\n\s*\]\)/,
  "job detail page should not unconditionally load portal management data",
);

console.log("job-portal-actions.read.test.ts passed");

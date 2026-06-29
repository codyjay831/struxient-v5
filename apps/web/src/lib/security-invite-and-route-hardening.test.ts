import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relativePath: string): string {
  return readFileSync(path.join(srcRoot, relativePath), "utf8");
}

test("invite accept flows contain no debug telemetry beacon", () => {
  const invitePage = readSrc("app/invite/[token]/page.tsx");
  const inviteAcceptAction = readSrc("app/invite/[token]/accept-actions.ts");

  for (const source of [invitePage, inviteAcceptAction]) {
    assert.doesNotMatch(source, /127\.0\.0\.1:7937\/ingest/);
    assert.doesNotMatch(source, /X-Debug-Session-Id/);
    assert.doesNotMatch(source, /#region agent log/);
  }
});

test("team invite actions do not return raw tokens in production paths", () => {
  const teamActions = readSrc("app/(workspace)/settings/team/team-actions.ts");

  assert.doesNotMatch(teamActions, /inviteToken:\s*string/);
  assert.doesNotMatch(teamActions, /return\s*\{[\s\S]*inviteToken/);
  assert.match(teamActions, /allowManualLinkExposure\s*=\s*process\.env\.NODE_ENV\s*!==\s*"production"/);
});

test("platform beta invite actions gate invite link exposure in production", () => {
  const betaActions = readSrc("app/(platform)/platform/beta-access/beta-access-actions.ts");
  const betaAccess = readSrc("lib/platform/platform-beta-access.ts");

  assert.match(betaActions, /process\.env\.NODE_ENV\s*!==\s*"production"/);
  assert.match(betaAccess, /process\.env\.NODE_ENV\s*!==\s*"production"\s*\?\s*buildBetaSignupUrl/);
  assert.doesNotMatch(betaAccess, /inviteToken:\s*string/);
});

test("request and token sensitive route handlers are explicitly force-dynamic", () => {
  const routeFiles = [
    "app/api/ai/suggest-tags/route.ts",
    "app/api/portal/documents/[resourceId]/route.ts",
    "app/api/media/attachments/[attachmentId]/route.ts",
    "app/api/quotes/signature-artifacts/[artifactId]/route.ts",
    "app/api/auth/[...nextauth]/route.ts",
    "app/api/billing/webhook/route.ts",
    "app/api/notifications/resend/webhook/route.ts",
    "app/api/notifications/twilio/status/route.ts",
    "app/q/sign/[recipientToken]/sent-pdf/route.ts",
  ];

  for (const file of routeFiles) {
    const source = readSrc(file);
    assert.match(
      source,
      /export const dynamic\s*=\s*"force-dynamic"/,
      `${file} should export force-dynamic`,
    );
  }
});

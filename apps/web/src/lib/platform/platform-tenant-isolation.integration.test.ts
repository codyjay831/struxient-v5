import assert from "node:assert/strict";
import test from "node:test";
import { db } from "@/lib/db";
import { getPlatformOrganizationSummary } from "./platform-organizations";

const platformCtx = {
  userId: "platform-operator",
  userEmail: "ops@example.com",
  platformAccessId: "access-test",
  role: "OPERATOR" as const,
  authSource: "session" as const,
  requestId: "req-test",
};

test("integration: organization inspector scopes to explicit target organization", async () => {
  const organizations = await db.organization.findMany({
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, name: true },
  });

  if (organizations.length < 2) {
    test.skip("requires at least two organizations in the database");
    return;
  }

  const [orgA, orgB] = organizations;
  const summary = await getPlatformOrganizationSummary(platformCtx, orgB.id);

  assert.ok(summary);
  assert.equal(summary.id, orgB.id);
  assert.equal(summary.name, orgB.name);
  assert.notEqual(summary.id, orgA.id);
});

test("integration: missing organization returns null for notFound handling", async () => {
  const summary = await getPlatformOrganizationSummary(
    platformCtx,
    "nonexistent-organization-id",
  );
  assert.equal(summary, null);
});

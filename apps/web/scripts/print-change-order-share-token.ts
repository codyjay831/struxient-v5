/**
 * Mint or rotate a Change Order customer share token and print the browser URL.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/print-change-order-share-token.ts --changeOrderId=<id>
 *   npx tsx scripts/print-change-order-share-token.ts --jobId=<id>
 *
 * Requires DATABASE_URL and dev seed. The CO must exist in dev-org-id.
 * If the CO is DRAFT or CUSTOMER_REQUESTED_CHANGES, this marks it SENT and mints a token.
 * If already SENT, rotates the token (same behavior as re-send) so old /co/[token] links 404.
 */
import { ChangeOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { DEV_ORGANIZATION_ID } from "@/lib/dev-organization";
import { createPublicAccessToken, hashPublicAccessToken } from "@/lib/public-access/public-token-crypto";

const SENDABLE_STATUSES: ChangeOrderStatus[] = [
  ChangeOrderStatus.DRAFT,
  ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
  ChangeOrderStatus.SENT,
];

function readArg(prefix: string): string | null {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : null;
}

async function resolveChangeOrderId(): Promise<string> {
  const changeOrderId = readArg("--changeOrderId");
  if (changeOrderId) return changeOrderId;

  const jobId = readArg("--jobId");
  if (!jobId) {
    throw new Error("Pass --changeOrderId=<id> or --jobId=<id>.");
  }

  const row = await db.changeOrder.findFirst({
    where: {
      organizationId: DEV_ORGANIZATION_ID,
      jobId,
      status: { in: SENDABLE_STATUSES },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true, number: true },
  });
  if (!row) {
    throw new Error(`No change order found for job ${jobId} in dev org.`);
  }
  console.log(`Using change order #${row.number} (${row.id}, status=${row.status})`);
  return row.id;
}

async function ensureSentWithFreshToken(changeOrderId: string): Promise<string> {
  const changeOrder = await db.changeOrder.findFirst({
    where: { id: changeOrderId, organizationId: DEV_ORGANIZATION_ID },
    select: { id: true, status: true, number: true },
  });
  if (!changeOrder) {
    throw new Error(`Change order ${changeOrderId} not found in dev org.`);
  }
  if (!SENDABLE_STATUSES.includes(changeOrder.status)) {
    throw new Error(
      `Change order #${changeOrder.number} is ${changeOrder.status}. Create a new draft or use a SENT/DRAFT CO.`,
    );
  }

  const rawToken = createPublicAccessToken();
  const hashed = hashPublicAccessToken(rawToken);

  await db.$transaction(async (tx) => {
    const existing = await tx.changeOrderShareToken.findUnique({
      where: { changeOrderId },
    });
    if (existing) {
      await tx.changeOrderShareToken.update({
        where: { changeOrderId },
        data: { token: hashed, revokedAt: null },
      });
    } else {
      await tx.changeOrderShareToken.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          changeOrderId,
          token: hashed,
        },
      });
    }

    if (changeOrder.status !== ChangeOrderStatus.SENT) {
      await tx.changeOrder.updateMany({
        where: {
          id: changeOrderId,
          organizationId: DEV_ORGANIZATION_ID,
          status: {
            in: [ChangeOrderStatus.DRAFT, ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES],
          },
        },
        data: { status: ChangeOrderStatus.SENT },
      });
    }
  });

  return rawToken;
}

async function main() {
  const changeOrderId = await resolveChangeOrderId();
  const rawToken = await ensureSentWithFreshToken(changeOrderId);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.QA_BASE_URL ?? "http://localhost:3001";
  const url = `${base.replace(/\/$/, "")}/co/${rawToken}`;

  console.log("");
  console.log("Fresh Change Order customer URL:");
  console.log(url);
  console.log("");
  console.log("Open in a private window. Previous /co/[token] links for this CO are now invalid.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import { PlatformRole } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { sanitizePlatformAuditMetadata } from "../../src/lib/platform/platform-audit";

const SCRIPT_VERSION = "1.0.0";

function parseArgs(argv: string[]): {
  email: string | null;
  force: boolean;
  confirm: boolean;
} {
  let email: string | null = null;
  let force = false;
  let confirm = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email" && argv[i + 1]) {
      email = argv[i + 1].trim().toLowerCase();
      i += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--confirm") {
      confirm = true;
    }
  }

  return { email, force, confirm };
}

async function main() {
  const { email, force, confirm } = parseArgs(process.argv.slice(2));

  if (!email) {
    console.error("Usage: npx tsx scripts/platform/bootstrap-operator.ts --email operator@example.com [--confirm] [--force]");
    process.exit(1);
  }

  if (!confirm) {
    console.error("Refusing to run without --confirm. This creates platform operator access.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PLATFORM_BOOTSTRAP !== "1") {
    console.error("Production bootstrap requires ALLOW_PLATFORM_BOOTSTRAP=1");
    process.exit(1);
  }

  if (process.env.PLATFORM_BOOTSTRAP_DISABLED === "1") {
    console.error("Bootstrap is disabled via PLATFORM_BOOTSTRAP_DISABLED=1");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true },
    });

    if (!user) {
      await prisma.$transaction(async (tx) => {
        await tx.platformAuditEvent.create({
          data: {
            actorType: "SYSTEM",
            actorUserId: null,
            actorEmailSnapshot: null,
            action: "platform.bootstrap.failed",
            targetType: "user",
            targetId: null,
            outcome: "ERROR",
            metadataJson: sanitizePlatformAuditMetadata("platform.bootstrap.failed", {
              granteeEmail: email,
              method: "bootstrap_script",
              environment: process.env.NODE_ENV ?? "unknown",
              scriptVersion: SCRIPT_VERSION,
              cause: "user_not_found",
            }),
          },
        });
      });
      console.error(`No user found for email: ${email}`);
      process.exit(1);
    }

    const existing = await prisma.platformAccess.findUnique({
      where: { userId: user.id },
    });

    if (existing && existing.revokedAt && !force) {
      console.error("Platform access exists but is revoked. Re-run with --force to restore.");
      process.exit(1);
    }

    if (existing && !existing.revokedAt) {
      console.log(`Platform access already active for ${user.email}`);
      process.exit(0);
    }

    await prisma.$transaction(async (tx) => {
      const access = existing
        ? await tx.platformAccess.update({
            where: { id: existing.id },
            data: {
              role: PlatformRole.OPERATOR,
              revokedAt: null,
              revokedByUserId: null,
            },
          })
        : await tx.platformAccess.create({
            data: {
              userId: user.id,
              role: PlatformRole.OPERATOR,
              createdByUserId: null,
            },
          });

      await tx.platformAuditEvent.create({
        data: {
          actorType: "SYSTEM",
          actorUserId: null,
          actorEmailSnapshot: null,
          action: "platform.access.bootstrapped",
          targetType: "platform_access",
          targetId: access.id,
          outcome: "SUCCESS",
          metadataJson: sanitizePlatformAuditMetadata("platform.access.bootstrapped", {
            granteeEmail: user.email,
            role: PlatformRole.OPERATOR,
            method: "bootstrap_script",
            environment: process.env.NODE_ENV ?? "unknown",
            scriptVersion: SCRIPT_VERSION,
          }),
        },
      });
    });

    console.log(`Platform operator access bootstrapped for ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});

import { db } from "@/lib/db";
import { createCustomerPortalAccess } from "@/lib/customer-portal/access-service";

async function main() {
  const job = await db.job.findFirst({
    where: { customerId: { not: null }, status: "ACTIVE" },
    select: { id: true, customerId: true, organizationId: true },
  });
  if (!job) throw new Error("no job");

  const membership = await db.membership.findFirst({
    where: { organizationId: job.organizationId, role: "OWNER" },
    select: { id: true },
  });
  if (!membership) throw new Error("no membership");

  const contact = await db.customerContact.create({
    data: {
      organizationId: job.organizationId,
      customerId: job.customerId!,
      name: "HTTP Smoke",
      email: `http-smoke-${Date.now()}@test.local`,
      isPrimary: false,
    },
  });

  const { magicLinkToken, accessId } = await createCustomerPortalAccess({
    organizationId: job.organizationId,
    customerId: job.customerId!,
    jobId: job.id,
    customerContactId: contact.id,
    invitedByMembershipId: membership.id,
    contactEmail: contact.email,
    expiresInDays: 1,
  });

  for (const base of ["http://127.0.0.1:3001", "http://localhost:3001"]) {
    try {
      const r = await fetch(`${base}/portal/${magicLinkToken}`, { redirect: "manual" });
      console.log(`${base}/portal/[token] => ${r.status}`);
    } catch (e) {
      console.log(`${base} fetch error:`, e instanceof Error ? e.message : e);
    }
  }

  await db.customerPortalMagicLinkToken.deleteMany({ where: { customerPortalAccessId: accessId } });
  await db.customerPortalAccess.delete({ where: { id: accessId } });
  await db.customerContact.delete({ where: { id: contact.id } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

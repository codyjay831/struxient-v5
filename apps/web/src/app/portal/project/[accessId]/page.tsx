import { notFound } from "next/navigation";
import { CustomerPortalAccessStatus, CustomerPortalEventType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCustomerPortalAccess } from "@/lib/customer-portal/authorize";
import { buildCustomerProjectPortalDocument } from "@/lib/customer-portal/presenter";
import { appendCustomerPortalEvent } from "@/lib/customer-portal/event-service";
import { CustomerProjectPortalView } from "@/components/customer-portal/customer-project-portal-view";
import { CustomerPortalRequestForm } from "@/components/customer-portal/customer-portal-request-form";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function CustomerProjectPortalPage({
  params,
}: {
  params: Promise<{ accessId: string }>;
}) {
  const { accessId } = await params;

  let auth;
  try {
    auth = await requireCustomerPortalAccess({ accessId });
  } catch {
    notFound();
  }

  const access = await db.customerPortalAccess.findUnique({
    where: { id: accessId },
    select: { status: true },
  });
  if (!access || access.status !== CustomerPortalAccessStatus.ACTIVE) {
    notFound();
  }

  const document = await buildCustomerProjectPortalDocument({
    accessId: auth.customerPortalAccessId,
    organizationId: auth.organizationId,
    customerId: auth.customerId,
    jobId: auth.jobId,
    accessLevel: auth.accessLevel,
  });

  const headerList = await headers();
  void appendCustomerPortalEvent({
    organizationId: auth.organizationId,
    customerId: auth.customerId,
    jobId: auth.jobId,
    customerPortalAccessId: auth.customerPortalAccessId,
    portalIdentityId: auth.portalIdentityId,
    eventType: CustomerPortalEventType.PORTAL_OPENED,
    ipAddress: headerList.get("x-forwarded-for")?.split(",")[0] ?? null,
    userAgent: headerList.get("user-agent"),
  });

  return (
    <>
      <CustomerProjectPortalView document={document} accessId={accessId} />
      <div className="mx-auto max-w-xl px-4 pb-10 sm:px-8">
        <CustomerPortalRequestForm accessId={accessId} />
      </div>
    </>
  );
}

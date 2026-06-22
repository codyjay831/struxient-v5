import { notFound } from "next/navigation";
import { loadCustomerPortalPreviewDocument } from "@/app/(workspace)/jobs/job-portal-actions";
import { CustomerProjectPortalView } from "@/components/customer-portal/customer-project-portal-view";

export const dynamic = "force-dynamic";

export default async function CustomerPortalPreviewPage({
  params,
}: {
  params: Promise<{ jobId: string; accessId: string }>;
}) {
  const { jobId, accessId } = await params;

  let document;
  try {
    document = await loadCustomerPortalPreviewDocument(accessId);
  } catch {
    notFound();
  }

  return (
    <CustomerProjectPortalView
      document={document}
      accessId={accessId}
      showStaffPreviewBanner
    />
  );
}

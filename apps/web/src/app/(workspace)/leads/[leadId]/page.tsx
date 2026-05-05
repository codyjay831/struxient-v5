import { LeadWorkspaceShell } from "@/components/shells/lead-workspace-shell";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  return <LeadWorkspaceShell mode="detail" leadId={leadId} />;
}

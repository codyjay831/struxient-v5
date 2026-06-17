import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { FileText, Users, Wallet } from "lucide-react";

export default function PaymentsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader variant="compact" title="Payments" />

      <WorkspacePanel className="border-brand/20 bg-brand-muted/30">
        <EmptyState
          icon={Wallet}
          title="Payment tracking is on the way"
          description="Commercial terms live on your quotes today. When payments launch, you'll see requested, collected, and overdue amounts here — linked to the work they belong to."
        >
          <ButtonLink href="/leads" variant="primary" size="sm">
            <FileText className="size-3.5" />
            Go to sales
          </ButtonLink>
          <ButtonLink href="/customers" variant="muted" size="sm">
            <Users className="size-3.5" />
            Customers
          </ButtonLink>
        </EmptyState>
      </WorkspacePanel>
    </div>
  );
}

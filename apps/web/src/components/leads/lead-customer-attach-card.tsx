"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { LeadWorkspaceCustomerCreateInline, type LeadWorkspaceCustomerCreateLeadInput } from "./lead-workspace-customer-create-inline";
import { LeadCustomerSearchDialog } from "./lead-customer-search-dialog";

/**
 * Single card for attaching a customer to a lead.
 *
 * Workstation fallback: compact search trigger + inline create when no search active.
 */
export function LeadCustomerAttachCard({
  lead,
  editLeadHref,
  onSuccess,
}: {
  lead: LeadWorkspaceCustomerCreateLeadInput;
  editLeadHref: string;
  onSuccess: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
      >
        <Search className="size-4" />
        Link existing customer
      </button>

      <LeadWorkspaceCustomerCreateInline
        lead={lead}
        editLeadHref={editLeadHref}
        onSuccess={onSuccess}
      />

      <LeadCustomerSearchDialog
        leadId={lead.id}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSuccess={onSuccess}
      />
    </div>
  );
}

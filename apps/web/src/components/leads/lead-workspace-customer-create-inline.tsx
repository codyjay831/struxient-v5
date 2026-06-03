"use client";

import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import {
  LeadCustomerPreviewBlock,
  useLeadCustomerCreateForm,
  type LeadWorkspaceCustomerCreateLeadInput,
} from "@/components/leads/lead-customer-create-shared";

export type { LeadWorkspaceCustomerCreateLeadInput };

const primaryBtnClass =
  "rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5";

const secondaryBtnClass =
  "rounded-lg border border-border bg-surface text-foreground-muted text-xs px-3 py-2 hover:text-foreground hover:border-border-strong transition-colors";

/**
 * In-place create-customer surface used by Leads workspace and Workstation.
 * Uses workspace-safe server action + caller `onSuccess` (typically `router.refresh()`).
 */
export function LeadWorkspaceCustomerCreateInline({
  lead,
  editLeadHref,
  onSuccess,
}: {
  lead: LeadWorkspaceCustomerCreateLeadInput;
  editLeadHref: string;
  onSuccess: () => void;
}) {
  const { prepared, state, dispatch, isPending } = useLeadCustomerCreateForm(lead, onSuccess);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center gap-2">
        <UserRound className="size-4 text-foreground-subtle" />
        <p className="text-xs font-bold text-foreground-subtle uppercase tracking-wider">
          Create customer
        </p>
      </div>

      <LeadCustomerPreviewBlock lead={lead} editLeadHref={editLeadHref} />

      {state.error ? (
        <p
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <form action={dispatch} className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !prepared.ok}
          aria-busy={isPending}
          className={primaryBtnClass}
        >
          {isPending ? "Creating…" : "Confirm & Create"}
          {!isPending && <ArrowRight className="size-3.5 opacity-70" />}
        </button>
        <Link href={editLeadHref} className={secondaryBtnClass}>
          Edit details
        </Link>
      </form>
    </div>
  );
}

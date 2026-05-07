"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer-from-lead";
import {
  createCustomerFromLeadWorkspaceAction,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/leads-workspace-actions";

export type LeadWorkspaceCustomerCreateLeadInput = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

const primaryBtnClass =
  "rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5";

const secondaryBtnClass =
  "rounded-lg border border-border bg-surface text-foreground-muted text-xs px-3 py-2 hover:text-foreground hover:border-border-strong transition-colors";

/**
 * In-place “create customer from lead” surface used by Leads workspace and Workstation.
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
  const boundAction = createCustomerFromLeadWorkspaceAction.bind(null, lead.id);
  const [state, dispatch, isPending] = useActionState<WorkspaceFormState, FormData>(
    boundAction,
    {},
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  const prepared = prepareCustomerFromLead({
    title: lead.title,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">
        Create customer from lead
      </p>
      <p className="text-xs text-foreground-muted leading-relaxed">
        Creates a new customer record from this intake and links it to the lead. Review the
        preview, then confirm.
      </p>

      {!prepared.ok ? (
        <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-danger">
          {prepared.error}{" "}
          <Link
            href={editLeadHref}
            className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
          >
            Edit lead
          </Link>
        </div>
      ) : (
        <dl className="rounded-lg border border-border bg-background px-4 py-3 grid gap-2.5 text-sm">
          <div>
            <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
              Display name
            </dt>
            <dd className="mt-0.5 font-medium text-foreground">{prepared.data.displayName}</dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
              Email
            </dt>
            <dd className="mt-0.5 text-foreground-muted break-all">
              {prepared.data.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
              Phone
            </dt>
            <dd className="mt-0.5 text-foreground-muted">{prepared.data.phone ?? "—"}</dd>
          </div>
        </dl>
      )}

      {state.error && (
        <p
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      <form action={dispatch} className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !prepared.ok}
          aria-busy={isPending}
          className={primaryBtnClass}
        >
          {isPending ? "Creating…" : "Create customer from lead"}
        </button>
        <Link href={editLeadHref} className={secondaryBtnClass}>
          Edit lead first
        </Link>
      </form>
    </div>
  );
}

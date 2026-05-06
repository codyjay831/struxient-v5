"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { LeadFormState } from "@/app/(workspace)/leads/lead-form-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { handoffPrimaryLinkClass } from "@/components/ui/handoff-panel";
import { UserRound } from "lucide-react";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const initialActionState: LeadFormState = {};

export function LeadLinkCustomerForm({
  linkFormAction,
  customers,
}: {
  linkFormAction: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  customers: { id: string; displayName: string }[];
}) {
  const [state, formAction, isPending] = useActionState(linkFormAction, initialActionState);

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="No customer records yet"
        description="Create a relationship record in Customers first, then return here to link it to this lead."
      >
        <Link href="/customers/new" className={handoffPrimaryLinkClass}>
          New customer
        </Link>
        <Link href="/customers" className={mutedLinkClass}>
          Browse customers
        </Link>
      </EmptyState>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="block" htmlFor="lead-link-customer-select">
          <span className={fieldLabelClass}>Customer</span>
          <select
            id="lead-link-customer-select"
            name="customerId"
            required
            className={controlClass}
            defaultValue=""
          >
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className={primaryButtonClass}
        >
          {isPending ? "Linking…" : "Link to customer"}
        </button>
        <Link href="/customers" className={mutedLinkClass}>
          Browse customers
        </Link>
      </div>
    </form>
  );
}

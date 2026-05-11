"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { SalesIntakeFormState } from "@/app/(workspace)/sales/sales-form-actions";
import type { SalesIntakeDetailPayload } from "@/lib/sales-intake-display";
import { prepareCustomerFromSalesIntake } from "@/lib/sales-intake-create-customer";
import { formatPhoneForDisplay } from "@/lib/format-phone-display";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const initialActionState: SalesIntakeFormState = {};

export function SalesIntakeCreateCustomerFromSalesIntakeForm({
  salesIntake,
  formAction,
}: {
  salesIntake: SalesIntakeDetailPayload;
  formAction: (
    prevState: SalesIntakeFormState,
    formData: FormData,
  ) => Promise<SalesIntakeFormState>;
}) {
  const [state, submitAction, isPending] = useActionState(formAction, initialActionState);

  const jobsiteLine = salesIntake.jobsiteAddressLine?.trim() ?? "";
  const hasJobsite = jobsiteLine.length > 0;

  const prepared = prepareCustomerFromSalesIntake({
    title: salesIntake.title,
    contactName: salesIntake.contactName,
    email: salesIntake.email,
    phone: salesIntake.phone,
    notes: salesIntake.notes,
    source: salesIntake.source,
  });

  return (
    <div className="space-y-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
        Create customer
      </p>
      <p className="text-xs leading-relaxed text-foreground-muted">
        This saves the contact info and service address from this request, then links the request to
        the new customer.
      </p>

      {!prepared.ok ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {prepared.error}{" "}
          <Link
            href={`/sales/${salesIntake.id}/edit`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Edit sales intake
          </Link>
        </p>
      ) : (
        <div className="rounded-lg border border-border bg-surface px-4 py-4">
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
            Review
          </p>
          <dl className="mt-3 grid gap-3 text-sm">
            <div>
              <dt className={fieldLabelClass}>Name</dt>
              <dd className="mt-0.5 font-medium text-foreground">{prepared.data.displayName}</dd>
            </div>
            <div>
              <dt className={fieldLabelClass}>Company</dt>
              <dd className="mt-0.5 text-foreground-muted">—</dd>
            </div>
            <div>
              <dt className={fieldLabelClass}>Email</dt>
              <dd className="mt-0.5 break-all text-foreground-muted">
                {prepared.data.email ?? "—"}
              </dd>
            </div>
            <div>
              <dt className={fieldLabelClass}>Phone</dt>
              <dd className="mt-0.5 text-foreground-muted">
                {prepared.data.phone
                  ? formatPhoneForDisplay(prepared.data.phone) || prepared.data.phone
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className={fieldLabelClass}>Service address / project location</dt>
              <dd className="mt-0.5">
                {hasJobsite ? (
                  <p className="text-foreground-muted leading-relaxed">{jobsiteLine}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Service address needed</p>
                    <p className="text-xs leading-relaxed text-foreground-muted">
                      Add the project address before scheduling or creating a job.
                    </p>
                    <Link href={`/sales/${salesIntake.id}/edit`} className={mutedLinkClass}>
                      Add service address
                    </Link>
                  </div>
                )}
              </dd>
            </div>
            <div>
              <dt className={fieldLabelClass}>Request details</dt>
              <dd className="mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground-muted">
                {prepared.data.notes}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <form action={submitAction} className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !prepared.ok}
          aria-busy={isPending}
          className={primaryButtonClass}
        >
          {isPending ? "Creating…" : "Create customer"}
        </button>
        <Link href={`/sales/${salesIntake.id}/edit`} className={mutedLinkClass}>
          Edit sales intake first
        </Link>
      </form>
    </div>
  );
}

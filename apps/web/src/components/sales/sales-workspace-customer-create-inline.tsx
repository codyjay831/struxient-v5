"use client";

import { SalesIntakeSource } from "@prisma/client";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import { prepareCustomerFromSalesIntake } from "@/lib/sales-intake-create-customer";
import { formatPhoneForDisplay } from "@/lib/format-phone-display";
import {
  createCustomerFromSalesIntakeWorkspaceAction,
  type WorkspaceFormState,
} from "@/app/(workspace)/sales/sales-workspace-actions";

export type SalesIntakeWorkspaceCustomerCreateSalesIntakeInput = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source?: SalesIntakeSource;
  /** Same resolved line as `SalesIntakeWorkSurfaceData.jobsiteAddressLine` / quote & job surfaces. */
  jobsiteAddressLine?: string | null;
};

const primaryBtnClass =
  "rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5";

const secondaryBtnClass =
  "rounded-lg border border-border bg-surface text-foreground-muted text-xs px-3 py-2 hover:text-foreground hover:border-border-strong transition-colors";

/**
 * In-place create-customer surface used by Sales Intakes workspace and Workstation.
 * Uses workspace-safe server action + caller `onSuccess` (typically `router.refresh()`).
 */
export function SalesIntakeWorkspaceCustomerCreateInline({
  salesIntake,
  editSalesIntakeHref,
  onSuccess,
}: {
  salesIntake: SalesIntakeWorkspaceCustomerCreateSalesIntakeInput;
  editSalesIntakeHref: string;
  onSuccess: () => void;
}) {
  const jobsiteLine = salesIntake.jobsiteAddressLine?.trim() ?? "";
  const hasJobsite = jobsiteLine.length > 0;
  const boundAction = createCustomerFromSalesIntakeWorkspaceAction.bind(null, salesIntake.id);
  const [state, dispatch, isPending] = useActionState<WorkspaceFormState, FormData>(
    boundAction,
    {},
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  const prepared = prepareCustomerFromSalesIntake({
    title: salesIntake.title,
    contactName: salesIntake.contactName,
    email: salesIntake.email,
    phone: salesIntake.phone,
    notes: salesIntake.notes,
    source: salesIntake.source ?? SalesIntakeSource.MANUAL,
  });

  const phonePreview =
    prepared.ok && prepared.data.phone
      ? formatPhoneForDisplay(prepared.data.phone) || prepared.data.phone
      : prepared.ok
        ? "—"
        : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center gap-2">
        <UserRound className="size-4 text-foreground-subtle" />
        <p className="text-xs font-bold text-foreground-subtle uppercase tracking-wider">
          Create customer
        </p>
      </div>

      {!prepared.ok ? (
        <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-danger">
          {prepared.error}{" "}
          <Link
            href={editSalesIntakeHref}
            className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
          >
            Edit sales intake
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-foreground-muted leading-relaxed">
            This will save the contact info and service address from this request.
          </p>
          <dl className="rounded-lg border border-border bg-background px-4 py-3 grid gap-2.5 text-sm">
            <div>
              <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                Name
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">{prepared.data.displayName}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Email
                </dt>
                <dd className="mt-0.5 text-foreground-muted break-all truncate">
                  {prepared.data.email ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Phone
                </dt>
                <dd className="mt-0.5 text-foreground-muted">{phonePreview}</dd>
              </div>
            </div>
            <div>
              <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                Service address / project location
              </dt>
              <dd className="mt-0.5">
                {hasJobsite ? (
                  <p className="text-foreground-muted leading-relaxed">{jobsiteLine}</p>
                ) : (
                  <p
                    className="rounded-md border border-border border-l-[3px] border-l-warning/50 bg-warning/5 px-2.5 py-2 text-xs leading-relaxed text-foreground-muted"
                    role="status"
                  >
                    No service address found for this request. Add one before scheduling or
                    creating a job.{" "}
                    <Link
                      href={editSalesIntakeHref}
                      className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
                    >
                      Edit sales intake
                    </Link>
                  </p>
                )}
              </dd>
            </div>
          </dl>
        </div>
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
          {isPending ? "Creating…" : "Confirm & Create"}
          {!isPending && <ArrowRight className="size-3.5 opacity-70" />}
        </button>
        <Link href={editSalesIntakeHref} className={secondaryBtnClass}>
          Edit details
        </Link>
      </form>
    </div>
  );
}

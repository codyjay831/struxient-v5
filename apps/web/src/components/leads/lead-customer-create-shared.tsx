"use client";

import { LeadChannel } from "@prisma/client";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer";
import { formatPhoneForDisplay } from "@/lib/format-phone-display";
import {
  createCustomerFromLeadWorkspaceAction,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/lead-workspace-actions";

export type LeadWorkspaceCustomerCreateLeadInput = {
  id: string;
  title: string;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source?: LeadChannel;
  jobsiteAddressLine?: string | null;
};

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

export function useLeadCustomerCreateForm(
  lead: LeadWorkspaceCustomerCreateLeadInput,
  onSuccess: () => void,
) {
  const jobsiteLine = lead.jobsiteAddressLine?.trim() ?? "";
  const hasJobsite = jobsiteLine.length > 0;
  const boundAction = createCustomerFromLeadWorkspaceAction.bind(null, lead.id);
  const [state, dispatch, isPending] = useActionState<WorkspaceFormState, FormData>(
    boundAction,
    {},
  );

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!state.success) return;
    onSuccessRef.current();
  }, [state.success]);

  const prepared = prepareCustomerFromLead({
    title: lead.title,
    contactName: lead.contactName,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
    source: lead.source ?? LeadChannel.MANUAL,
  });

  const phonePreview =
    prepared.ok && prepared.data.phone
      ? formatPhoneForDisplay(prepared.data.phone) || prepared.data.phone
      : prepared.ok
        ? "—"
        : null;

  return { prepared, state, dispatch, isPending, jobsiteLine, hasJobsite, phonePreview };
}

export function LeadCustomerPreviewBlock({
  lead,
  editLeadHref,
  compact = false,
}: {
  lead: LeadWorkspaceCustomerCreateLeadInput;
  editLeadHref: string;
  compact?: boolean;
}) {
  const jobsiteLine = lead.jobsiteAddressLine?.trim() ?? "";
  const hasJobsite = jobsiteLine.length > 0;
  const prepared = prepareCustomerFromLead({
    title: lead.title,
    contactName: lead.contactName,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
    source: lead.source ?? LeadChannel.MANUAL,
  });

  const phonePreview =
    prepared.ok && prepared.data.phone
      ? formatPhoneForDisplay(prepared.data.phone) || prepared.data.phone
      : prepared.ok
        ? "—"
        : null;

  if (!prepared.ok) {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-danger">
        {prepared.error}{" "}
        <Link
          href={editLeadHref}
          className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
        >
          Edit lead
        </Link>
      </div>
    );
  }

  if (compact) {
    return (
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className={sectionLabelClass}>Name</dt>
          <dd className="mt-0.5 font-medium text-foreground">{prepared.data.displayName}</dd>
        </div>
        <div>
          <dt className={sectionLabelClass}>Email</dt>
          <dd className="mt-0.5 text-foreground-muted truncate">{prepared.data.email ?? "—"}</dd>
        </div>
        <div>
          <dt className={sectionLabelClass}>Phone</dt>
          <dd className="mt-0.5 text-foreground-muted">{phonePreview}</dd>
        </div>
        <div>
          <dt className={sectionLabelClass}>Service address</dt>
          <dd className="mt-0.5 text-foreground-muted">
            {hasJobsite ? jobsiteLine : "No address on file"}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground-muted leading-relaxed">
        This will save the contact info and service address from this request.
      </p>
      <dl className="rounded-lg border border-border bg-background px-4 py-3 grid gap-2.5 text-sm">
        <div>
          <dt className={sectionLabelClass}>Name</dt>
          <dd className="mt-0.5 font-medium text-foreground">{prepared.data.displayName}</dd>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <dt className={sectionLabelClass}>Email</dt>
            <dd className="mt-0.5 text-foreground-muted break-all truncate">
              {prepared.data.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className={sectionLabelClass}>Phone</dt>
            <dd className="mt-0.5 text-foreground-muted">{phonePreview}</dd>
          </div>
        </div>
        <div>
          <dt className={sectionLabelClass}>Service address / project location</dt>
          <dd className="mt-0.5">
            {hasJobsite ? (
              <p className="text-foreground-muted leading-relaxed">{jobsiteLine}</p>
            ) : (
              <p
                className="rounded-md border border-border border-l-[3px] border-l-warning/50 bg-warning/5 px-2.5 py-2 text-xs leading-relaxed text-foreground-muted"
                role="status"
              >
                No service address found for this request. Add one before scheduling or creating a
                job.{" "}
                <Link
                  href={editLeadHref}
                  className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
                >
                  Edit lead
                </Link>
              </p>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

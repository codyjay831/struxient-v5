"use client";

import { useActionState } from "react";
import { LeadStatus } from "@prisma/client";
import { updateLeadStatusAction } from "@/app/(workspace)/leads/lead-form-actions";
import { Loader2, UserPlus, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export type WorkstationLeadPanelProps = {
  leadId: string;
  initialStatus: LeadStatus;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  hasCustomer: boolean;
};

export function WorkstationLeadPanel({
  leadId,
  initialStatus,
  contactName,
  email,
  phone,
  hasCustomer,
}: WorkstationLeadPanelProps) {
  const [state, formAction, isPending] = useActionState(
    updateLeadStatusAction.bind(null, leadId),
    {},
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
            Contact Info
          </h4>
          <div className="mt-1 text-sm text-foreground">
            {contactName && <p className="font-medium">{contactName}</p>}
            {email && <p>{email}</p>}
            {phone && <p>{phone}</p>}
            {!contactName && !email && !phone && <p className="italic text-foreground-muted">No contact info provided.</p>}
          </div>
        </div>
        <div>
          <h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
            Customer Link
          </h4>
          <div className="mt-1">
            {hasCustomer ? (
              <div className="flex items-center gap-1.5 text-sm text-success font-medium">
                <CheckCircle2 className="size-4" />
                Linked to customer
              </div>
            ) : (
              <Link
                href={`/leads/${leadId}#customer-link`}
                className="inline-flex items-center gap-1.5 text-sm text-accent font-medium hover:underline"
              >
                <UserPlus className="size-4" />
                Link or create customer
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {initialStatus === LeadStatus.OPEN && (
          <form action={formAction}>
            <input type="hidden" name="status" value={LeadStatus.QUALIFYING} />
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Mark as qualifying
            </button>
          </form>
        )}
      </div>

      {state.error && (
        <p className="text-xs font-medium text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useActionState } from "react";
import { Check, Loader2, MapPin, UserRound, X } from "lucide-react";
import {
  linkLeadToCustomerWorkspaceAction,
  type CustomerLinkPreview,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import { formatPhoneForDisplay } from "@/lib/format-phone-display";

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

const primaryBtnClass =
  "rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5 w-full justify-center";

function ContactCompareRow({
  label,
  leadValue,
  customerValue,
}: {
  label: string;
  leadValue: string | null;
  customerValue: string | null;
}) {
  if (!leadValue && !customerValue) return null;
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <p className={sectionLabelClass}>Request {label}</p>
        <p className="mt-0.5 text-foreground-muted truncate">{leadValue || "—"}</p>
      </div>
      <div>
        <p className={sectionLabelClass}>Customer {label}</p>
        <p className="mt-0.5 text-foreground truncate">{customerValue || "—"}</p>
      </div>
    </div>
  );
}

export function LeadCustomerLinkConfirmView({
  preview,
  leadId,
  onBack,
  onSuccess,
  showHeader = true,
}: {
  preview: CustomerLinkPreview;
  leadId: string;
  onBack?: () => void;
  onSuccess: () => void;
  showHeader?: boolean;
}) {
  const boundLinkAction = linkLeadToCustomerWorkspaceAction.bind(null, leadId);
  const [linkState, linkDispatch, isLinkPending] = useActionState<WorkspaceFormState, FormData>(
    boundLinkAction,
    {},
  );

  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (!linkState.success) return;
    onSuccessRef.current();
  }, [linkState.success]);

  const leadPhoneDisplay = preview.leadContact.phone
    ? formatPhoneForDisplay(preview.leadContact.phone) || preview.leadContact.phone
    : null;
  const customerPhoneDisplay = preview.customer.phone
    ? formatPhoneForDisplay(preview.customer.phone) || preview.customer.phone
    : null;

  const confirmLabel =
    preview.siteOutcome.kind === "existing-site"
      ? "Link to customer at existing jobsite"
      : preview.siteOutcome.kind === "add-new-site"
        ? "Link and add jobsite"
        : "Link to customer";

  return (
    <div className="space-y-4">
      {showHeader ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-foreground-subtle" />
            <p className="text-xs font-bold text-foreground-subtle uppercase tracking-wider">
              Review customer + jobsite
            </p>
          </div>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-foreground-subtle hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background px-4 py-3 space-y-3">
        <div>
          <p className={sectionLabelClass}>Customer</p>
          <p className="text-sm font-medium text-foreground">{preview.customer.displayName}</p>
          {preview.customer.companyName ? (
            <p className="text-sm text-foreground-muted">{preview.customer.companyName}</p>
          ) : null}
        </div>

        <ContactCompareRow
          label="name"
          leadValue={preview.leadContact.contactName || null}
          customerValue={preview.customer.displayName}
        />
        <ContactCompareRow
          label="email"
          leadValue={preview.leadContact.email}
          customerValue={preview.customer.email}
        />
        <ContactCompareRow
          label="phone"
          leadValue={leadPhoneDisplay}
          customerValue={customerPhoneDisplay}
        />
      </div>

      <div className="rounded-lg border border-border bg-background px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="size-4 shrink-0 text-foreground-subtle mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className={sectionLabelClass}>Jobsite for this request</p>
            <p className="mt-1 text-sm text-foreground">{preview.siteOutcomeDescription}</p>
            {preview.customerSiteCount > 1 && preview.siteOutcome.kind === "add-new-site" ? (
              <p className="mt-1 text-xs text-foreground-muted">
                This customer has {preview.customerSiteCount} saved service addresses. This request
                will add another when you confirm.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {linkState.error ? (
        <p className="text-xs text-danger" role="alert">
          {linkState.error}
        </p>
      ) : null}

      <form action={linkDispatch}>
        <input type="hidden" name="customerId" value={preview.customer.id} />
        <button type="submit" disabled={isLinkPending} className={primaryBtnClass}>
          {isLinkPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Linking…
            </>
          ) : (
            <>
              {confirmLabel}
              <Check className="size-3.5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

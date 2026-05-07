"use client";

/**
 * LeadsListClient — client component for the real Leads page.
 *
 * Action-kind mapping:
 *   OPEN_DRAFT_QUOTE        → workspace_tab  (Quote tab)
 *   OPEN_QUOTE              → workspace_tab  (Quote tab)
 *   START_QUOTE             → workspace_tab  (Quote tab — shows Start quote CTA)
 *   ATTACH_OR_CREATE_CUSTOMER → workspace_tab (Contact tab — inline create form)
 *   EDIT_CONTACT_INFO       → workspace_tab  (Contact tab — inline edit form)
 *   OPEN_JOB                → deep_link      (with job status context in Overview)
 *   OPEN_EXECUTION_REVIEW   → deep_link      (with quote/job context in Overview)
 *
 * In-place mutations use workspace-safe server actions that return results
 * instead of redirecting. After success the component calls router.refresh()
 * to re-fetch server data; the dialog stays open and shows updated state.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Pencil, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusBadgeTone } from "@/components/ui/status-badge";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer-from-lead";
import {
  createCustomerFromLeadWorkspaceAction,
  updateLeadContactWorkspaceAction,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/leads-workspace-actions";

/* ─── Serialized types (computed server-side, passed as plain props) ─────── */

export type SerializedProgressAction = {
  href: string;
  label: string;
  /** OPEN_DRAFT_QUOTE, OPEN_QUOTE, START_QUOTE — switch to Quote tab. */
  opensQuoteTab: boolean;
  /** ATTACH_OR_CREATE_CUSTOMER, EDIT_CONTACT_INFO — switch to Contact tab. */
  opensContactTab: boolean;
};

export type SerializedQuoteSummary = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  href: string;
};

export type SerializedLeadRow = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  sourceLabel: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  createdAtLabel: string;
  progressLabel: string;
  progressDescription: string;
  progressTone: StatusBadgeTone;
  progressState: string;
  progressPrimaryAction: SerializedProgressAction | null;
  progressSecondaryAction: SerializedProgressAction | null;
  activeJobId: string | null;
  activeJobStatus: string | null;
  /** Non-archived quotes, newest first. */
  quotes: SerializedQuoteSummary[];
  /** /leads/[id] */
  leadHref: string;
  /** /quotes/new?leadId=[id] */
  newQuoteHref: string;
};

/* ─── Workspace tab type ─────────────────────────────────────────────────── */

type WorkspaceTab = "overview" | "contact" | "activity" | "quote";

const WS_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contact", label: "Contact" },
  { id: "activity", label: "Activity" },
  { id: "quote", label: "Quote" },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none";

const primaryBtnClass =
  "rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5";

const secondaryBtnClass =
  "rounded-lg border border-border bg-surface text-foreground-muted text-xs px-3 py-2 hover:text-foreground hover:border-border-strong transition-colors";

/* ─── Compact lead row ───────────────────────────────────────────────────── */

function LeadRow({
  lead,
  active,
  onOpen,
}: {
  lead: SerializedLeadRow;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors",
        active ? "bg-background" : "hover:bg-background/60",
      ].join(" ")}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-foreground leading-snug">
            {lead.title}
          </span>
          <StatusBadge label={lead.progressLabel} tone={lead.progressTone} />
        </div>
        <p className="text-xs text-foreground-muted truncate mb-1.5">
          {lead.contactName ?? lead.email ?? "No contact"}
        </p>
        <div className="flex flex-wrap gap-x-2 text-xs text-foreground-subtle">
          <span>{lead.sourceLabel}</span>
          <span>·</span>
          <span>{lead.createdAtLabel}</span>
          {lead.customerDisplayName && (
            <>
              <span>·</span>
              <span>{lead.customerDisplayName}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 mt-0.5 rounded-md border border-border px-2 py-1 text-xs text-foreground-subtle hover:border-border-strong hover:text-foreground transition-colors">
        Open
        <ArrowUpRight className="w-3 h-3 ml-0.5" strokeWidth={1.5} />
      </div>
    </button>
  );
}

/* ─── Create customer from lead form ─────────────────────────────────────── */

function CreateCustomerForm({
  lead,
  onSuccess,
}: {
  lead: SerializedLeadRow;
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
            href={`${lead.leadHref}/edit`}
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
            <dd className="mt-0.5 font-medium text-foreground">
              {prepared.data.displayName}
            </dd>
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
            <dd className="mt-0.5 text-foreground-muted">
              {prepared.data.phone ?? "—"}
            </dd>
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
        <Link href={`${lead.leadHref}/edit`} className={secondaryBtnClass}>
          Edit lead first
        </Link>
      </form>
    </div>
  );
}

/* ─── Inline contact edit form ───────────────────────────────────────────── */

function EditContactForm({
  lead,
  onSuccess,
  onCancel,
}: {
  lead: SerializedLeadRow;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const boundAction = updateLeadContactWorkspaceAction.bind(null, lead.id);
  const [state, dispatch, isPending] = useActionState<WorkspaceFormState, FormData>(
    boundAction,
    {},
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={dispatch} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor="ws-contactName"
            className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle"
          >
            Contact name
          </label>
          <input
            id="ws-contactName"
            name="contactName"
            type="text"
            defaultValue={lead.contactName ?? ""}
            className={inputClass}
            placeholder="Name"
          />
        </div>
        <div>
          <label
            htmlFor="ws-email"
            className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle"
          >
            Email
          </label>
          <input
            id="ws-email"
            name="email"
            type="email"
            defaultValue={lead.email ?? ""}
            className={inputClass}
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label
            htmlFor="ws-phone"
            className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle"
          >
            Phone
          </label>
          <input
            id="ws-phone"
            name="phone"
            type="tel"
            defaultValue={lead.phone ?? ""}
            className={inputClass}
            placeholder="(555) 000-0000"
          />
        </div>
      </div>

      {state.error && (
        <p
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className={primaryBtnClass}
        >
          {isPending ? "Saving…" : "Save contact info"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryBtnClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Overview tab ───────────────────────────────────────────────────────── */

function OverviewTab({
  lead,
  onSwitchToQuote,
  onSwitchToContact,
}: {
  lead: SerializedLeadRow;
  onSwitchToQuote: () => void;
  onSwitchToContact: () => void;
}) {
  const { progressPrimaryAction: primary, progressSecondaryAction: secondary } = lead;
  const quoteLabel =
    lead.quotes.length > 0 ? lead.quotes[0].statusLabel : "Not started";

  function renderAction(
    action: SerializedProgressAction,
    variant: "primary" | "secondary",
  ) {
    const cls =
      variant === "primary"
        ? primaryBtnClass
        : secondaryBtnClass;

    if (action.opensQuoteTab) {
      return (
        <button type="button" onClick={onSwitchToQuote} className={cls}>
          {action.label}
          {variant === "primary" && (
            <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
          )}
        </button>
      );
    }
    if (action.opensContactTab) {
      return (
        <button type="button" onClick={onSwitchToContact} className={cls}>
          {action.label}
          {variant === "primary" && (
            <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
          )}
        </button>
      );
    }
    return (
      <Link href={action.href} className={cls}>
        {action.label}
        {variant === "primary" && (
          <ArrowUpRight className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
        )}
      </Link>
    );
  }

  return (
    <div className="space-y-4">
      {/* Next step */}
      <div className="rounded-xl border border-border bg-background p-5">
        <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">
          Next step
        </p>
        <h3 className="mt-1.5 text-base font-semibold text-foreground leading-snug">
          {lead.progressLabel}
        </h3>
        <p className="mt-1 text-sm text-foreground-muted leading-relaxed">
          {lead.progressDescription}
        </p>

        {/* Job context for JOB_ACTIVE / APPROVED_READY_TO_ACTIVATE */}
        {lead.activeJobId && (
          <div className="mt-3 rounded-lg border border-border bg-surface px-3 py-2.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                Linked job
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground capitalize">
                {lead.activeJobStatus
                  ? lead.activeJobStatus.charAt(0).toUpperCase() +
                    lead.activeJobStatus.slice(1).toLowerCase()
                  : "Active"}
              </p>
            </div>
            <p className="text-xs text-foreground-subtle">
              Opening the job page is the next step.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {primary && renderAction(primary, "primary")}
          {secondary && renderAction(secondary, "secondary")}
        </div>
      </div>

      {/* 4-field summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-foreground-subtle mb-0.5">Customer</p>
          <p className="text-sm font-medium text-foreground truncate">
            {lead.customerDisplayName ?? "Not linked"}
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchToQuote}
          className="rounded-lg border border-border bg-surface p-3 text-left hover:bg-background transition-colors"
        >
          <p className="text-xs text-foreground-subtle mb-0.5">Quote</p>
          <p className="text-sm font-medium text-foreground">{quoteLabel}</p>
        </button>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-foreground-subtle mb-0.5">Source</p>
          <p className="text-sm font-medium text-foreground">{lead.sourceLabel}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-foreground-subtle mb-0.5">Status</p>
          <StatusBadge label={lead.statusLabel} tone={lead.statusTone} />
        </div>
      </div>

      {/* Notes */}
      {lead.notes && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">
            Request notes
          </p>
          <p className="text-sm text-foreground-muted leading-relaxed">{lead.notes}</p>
        </div>
      )}

      {/* Full record */}
      <div className="pt-1">
        <Link
          href={lead.leadHref}
          className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Open full lead record
          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Contact tab ────────────────────────────────────────────────────────── */

function ContactTab({
  lead,
  onRefresh,
}: {
  lead: SerializedLeadRow;
  onRefresh: () => void;
}) {
  /**
   * Auto-expand the edit form when the lead has no contact info (ADD_CONTACT_INFO
   * state). Uses lazy initial state so it's set once per WorkspaceContent mount
   * (WorkspaceContent is keyed by lead.id, so each distinct lead gets fresh state).
   */
  const [isEditingContact, setIsEditingContact] = useState(
    () => lead.progressState === "ADD_CONTACT_INFO",
  );

  function handleContactSaved() {
    setIsEditingContact(false);
    onRefresh();
  }

  return (
    <div className="space-y-4">
      {/* ── Contact info ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">
            Contact info
          </p>
          {!isEditingContact && (
            <button
              type="button"
              onClick={() => setIsEditingContact(true)}
              className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" strokeWidth={1.5} />
              Edit
            </button>
          )}
        </div>

        {isEditingContact ? (
          <EditContactForm
            lead={lead}
            onSuccess={handleContactSaved}
            onCancel={() => setIsEditingContact(false)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle mb-0.5">
                Name
              </p>
              <p className="text-sm text-foreground-muted">
                {lead.contactName ?? "Not provided"}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle mb-0.5">
                Email
              </p>
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  className="text-sm text-foreground-muted hover:text-foreground transition-colors break-all"
                >
                  {lead.email}
                </a>
              ) : (
                <p className="text-sm text-foreground-muted">Not provided</p>
              )}
            </div>
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle mb-0.5">
                Phone
              </p>
              {lead.phone ? (
                <a
                  href={`tel:${lead.phone}`}
                  className="text-sm text-foreground-muted hover:text-foreground transition-colors"
                >
                  {lead.phone}
                </a>
              ) : (
                <p className="text-sm text-foreground-muted">Not provided</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Customer ─────────────────────────────────────────────────────── */}
      {lead.customerId ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-3">
            Customer
          </p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {lead.customerDisplayName}
              </p>
              <StatusBadge label="Linked" tone="approved" />
            </div>
            {lead.customerHref && (
              <Link
                href={lead.customerHref}
                className="text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors shrink-0"
              >
                Customer record
              </Link>
            )}
          </div>
        </div>
      ) : (
        <CreateCustomerForm lead={lead} onSuccess={onRefresh} />
      )}
    </div>
  );
}

/* ─── Activity tab ───────────────────────────────────────────────────────── */

function ActivityTab({ lead }: { lead: SerializedLeadRow }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-3">
          Activity
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-border-strong mt-1 shrink-0" />
            <span className="text-sm text-foreground-subtle">
              Lead created · {lead.createdAtLabel}
            </span>
          </div>
          {lead.customerDisplayName && (
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-border-strong mt-1 shrink-0" />
              <span className="text-sm text-foreground-subtle">
                Customer linked · {lead.customerDisplayName}
              </span>
            </div>
          )}
          {lead.quotes.map((q) => (
            <div key={q.id} className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-foreground mt-1 shrink-0" />
              <span className="text-sm text-foreground font-medium">
                Quote {q.statusLabel.toLowerCase()} · {q.title}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-foreground-subtle">
        Full activity log is available on the{" "}
        <Link
          href={lead.leadHref}
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          lead record
        </Link>
        .
      </p>
    </div>
  );
}

/* ─── Quote tab ──────────────────────────────────────────────────────────── */

function QuoteTab({
  lead,
  onSwitchToContact,
}: {
  lead: SerializedLeadRow;
  onSwitchToContact: () => void;
}) {
  if (lead.quotes.length === 0) {
    const canStart = lead.customerId != null;

    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">No quote started</p>
          <p className="text-xs text-foreground-subtle max-w-xs leading-relaxed">
            {canStart
              ? "Open the quote builder to create a quote for this lead. You can return to this workspace afterward."
              : "Link a customer first so the quote is tied to a billing record, then come back here to start one."}
          </p>
          {canStart ? (
            <Link
              href={lead.newQuoteHref}
              className={[primaryBtnClass, "mt-1"].join(" ")}
            >
              Open quote builder
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onSwitchToContact}
              className="text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Go to Contact tab to link or create a customer
            </button>
          )}
        </div>

        {!canStart && (
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-foreground-muted leading-relaxed">
            You can also start a quote without linking a customer by opening the full quote
            builder.{" "}
            <Link
              href={lead.newQuoteHref}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Open quote builder anyway
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lead.quotes.map((q) => (
        <div
          key={q.id}
          className="rounded-xl border border-border bg-surface overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
            <StatusBadge label={q.statusLabel} tone={q.statusTone} />
          </div>
          <div className="px-4 py-3 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground tabular-nums">
              {formatMoney(q.totalCents)}
            </span>
            <span className="text-xs text-foreground-subtle">
              · {q.lineItemCount}{" "}
              {q.lineItemCount === 1 ? "line item" : "line items"}
            </span>
          </div>
          <div className="px-4 pb-3">
            <Link
              href={q.href}
              className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Open full quote page
              <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      ))}

      <div className="pt-1">
        <Link
          href={lead.newQuoteHref}
          className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Start additional quote
          <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Workspace content ──────────────────────────────────────────────────── */

function WorkspaceContent({
  lead,
  activeTab,
  setActiveTab,
  onClose,
  onRefresh,
}: {
  lead: SerializedLeadRow;
  activeTab: WorkspaceTab;
  setActiveTab: (t: WorkspaceTab) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex max-h-[88vh] flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <StatusBadge label={lead.progressLabel} tone={lead.progressTone} />
            <span className="text-xs text-foreground-subtle">
              {lead.sourceLabel} · {lead.createdAtLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace"
            className="rounded-lg border border-border bg-surface p-1.5 text-foreground-subtle hover:text-foreground hover:bg-background transition-colors shrink-0"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-3">
          <h2 className="text-xl font-semibold text-foreground tracking-tight leading-tight">
            {lead.title}
          </h2>
          {lead.contactName && (
            <p className="text-sm text-foreground-muted mt-0.5">{lead.contactName}</p>
          )}
        </div>

        <div className="mt-3 inline-flex rounded-lg bg-background p-1 gap-0.5">
          {WS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === t.id
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-foreground-subtle hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "overview" && (
          <OverviewTab
            lead={lead}
            onSwitchToQuote={() => setActiveTab("quote")}
            onSwitchToContact={() => setActiveTab("contact")}
          />
        )}
        {activeTab === "contact" && (
          <ContactTab lead={lead} onRefresh={onRefresh} />
        )}
        {activeTab === "activity" && <ActivityTab lead={lead} />}
        {activeTab === "quote" && (
          <QuoteTab
            lead={lead}
            onSwitchToContact={() => setActiveTab("contact")}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Main export ────────────────────────────────────────────────────────── */

export function LeadsListClient({ leads }: { leads: SerializedLeadRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");

  const openLead = leads.find((l) => l.id === openLeadId) ?? null;

  /* Sync native dialog open/close state */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openLeadId && !dialog.open) {
      dialog.showModal();
    } else if (!openLeadId && dialog.open) {
      dialog.close();
    }
  }, [openLeadId]);

  /* Reset state when user presses Escape (native cancel) */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel() {
      setOpenLeadId(null);
      setActiveTab("overview");
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  function openWorkspace(id: string) {
    setActiveTab("overview");
    setOpenLeadId(id);
  }

  function closeWorkspace() {
    dialogRef.current?.close();
    setOpenLeadId(null);
    setActiveTab("overview");
  }

  return (
    <>
      {/* ── Lead rows ─────────────────────────────────────────────────── */}
      <div className="divide-y divide-border">
        {leads.map((lead) => (
          <LeadRow
            key={lead.id}
            lead={lead}
            active={lead.id === openLeadId}
            onOpen={() => openWorkspace(lead.id)}
          />
        ))}
      </div>

      {/* ── Customer / Lead Workspace ──────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl outline-none [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeWorkspace();
        }}
      >
        {openLead && (
          /*
           * Key by lead.id so all form/edit state (useActionState, useState)
           * resets cleanly when the user opens a different lead.
           */
          <WorkspaceContent
            key={openLead.id}
            lead={openLead}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onClose={closeWorkspace}
            onRefresh={() => router.refresh()}
          />
        )}
      </dialog>
    </>
  );
}

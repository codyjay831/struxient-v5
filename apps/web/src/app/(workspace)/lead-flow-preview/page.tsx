"use client";

/**
 * Lead Flow Preview — combined UX prototype.
 *
 * Behavior:
 * - Compact lead list as the primary scan surface.
 * - Clicking a lead opens a Customer/Lead Workspace in a native <dialog>.
 * - Quote work happens inside the workspace (Quote tab), not on a separate page.
 * - "Fix quote", "View quote", "Preview quote" switch to the Quote tab in-place.
 * - "Open full quote page" is available as a secondary/intentional action only.
 * - Mock data only — not connected to production data or server actions.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Search, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type WorkspaceTab = "overview" | "contact" | "activity" | "quote";
type Stage = "intake" | "verify" | "quote" | "send" | "approve" | "activate";
type ListTab = "Action needed" | "New" | "Quoted" | "Won" | "All";

type MockLineItem = { description: string; qty: string; amount: string };

type QuoteData = {
  state: "none" | "draft" | "sent" | "approved";
  totalCents: number;
  lineItems: MockLineItem[];
  readinessIssue: string | null;
  sentDaysAgo: number | null;
  scopeSummary: string | null;
};

type MockLead = {
  id: string;
  contact: string;
  project: string;
  source: string;
  age: string;
  value: string;
  status: string;
  statusTone: StatusBadgeTone;
  stage: Stage;
  nextStep: string;
  nextStepReason: string;
  risk: string | null;
  primaryAction: string;
  primaryOpensQuote: boolean;
  secondaryAction: string | null;
  secondaryOpensQuote: boolean;
  customer: string | null;
  email: string;
  phone: string;
  address: string | null;
  intakeNotes: string;
  internalNotes: string | null;
  timeline: string[];
  quote: QuoteData;
};

/* ─── Stages ─────────────────────────────────────────────────────────────── */

const STAGES: { id: Stage; label: string }[] = [
  { id: "intake",   label: "Intake"   },
  { id: "verify",   label: "Verify"   },
  { id: "quote",    label: "Quote"    },
  { id: "send",     label: "Send"     },
  { id: "approve",  label: "Approve"  },
  { id: "activate", label: "Activate" },
];

const STAGE_IDX = Object.fromEntries(
  STAGES.map((s, i) => [s.id, i]),
) as Record<Stage, number>;

/* ─── List filter tabs ───────────────────────────────────────────────────── */

const LIST_TABS: ListTab[] = ["Action needed", "New", "Quoted", "Won", "All"];

/* ─── Workspace tabs ─────────────────────────────────────────────────────── */

const WS_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "overview",  label: "Overview"  },
  { id: "contact",   label: "Contact"   },
  { id: "activity",  label: "Activity"  },
  { id: "quote",     label: "Quote"     },
];

/* ─── Mock data ──────────────────────────────────────────────────────────── */

const MOCK_LEADS: MockLead[] = [
  /* ── A: Needs customer ─────────────────────────────────────────────── */
  {
    id: "hendricks",
    contact: "Tom Hendricks",
    project: "Deck replacement",
    source: "Website",
    age: "2d",
    value: "$18k est.",
    status: "Needs customer",
    statusTone: "neutral",
    stage: "verify",
    nextStep: "Create customer from lead",
    nextStepReason:
      "This lead has enough intake detail to quote, but it is not attached to a customer record yet.",
    risk: "Quote locked",
    primaryAction: "Create customer",
    primaryOpensQuote: false,
    secondaryAction: "Search existing customers",
    secondaryOpensQuote: false,
    customer: null,
    email: "tom.hendricks@gmail.com",
    phone: "(612) 555-0142",
    address: null,
    intakeNotes:
      "Replace existing 400 sqft deck. Cedar or composite. Wants the work in 4–6 weeks.",
    internalNotes: null,
    timeline: [
      "Website request received",
      "Contact info extracted",
      "No customer match found",
    ],
    quote: {
      state: "none",
      totalCents: 0,
      lineItems: [],
      readinessIssue: null,
      sentDaysAgo: null,
      scopeSummary: null,
    },
  },

  /* ── B: Draft quote with readiness issue ───────────────────────────── */
  {
    id: "meridian",
    contact: "Dana Walsh",
    project: "HVAC upgrade",
    source: "Referral",
    age: "7d",
    value: "$12,450",
    status: "Quote incomplete",
    statusTone: "draft",
    stage: "quote",
    nextStep: "Finish scope summary",
    nextStepReason:
      "The draft quote exists, but the customer-facing scope summary is missing.",
    risk: "Not ready to send",
    primaryAction: "Fix quote",
    primaryOpensQuote: true,
    secondaryAction: "Preview quote",
    secondaryOpensQuote: true,
    customer: "Meridian Property Group",
    email: "dana@meridianpg.com",
    phone: "(651) 555-0033",
    address: "2450 Meridian Blvd, Unit 4, Eagan, MN",
    intakeNotes:
      "Commercial unit HVAC replacement before summer. Timeline matters more than lowest price.",
    internalNotes:
      "Billing goes to accounts@meridianpg.com — confirm before sending the quote.",
    timeline: [
      "Referral created",
      "Customer linked",
      "Draft quote started",
      "Readiness issue found",
    ],
    quote: {
      state: "draft",
      totalCents: 1_245_000,
      lineItems: [
        {
          description: "HVAC system replacement (2,400 sqft commercial)",
          qty: "1",
          amount: "$10,800",
        },
        { description: "Labor and site preparation", qty: "1", amount: "$1,650" },
        { description: "Permit coordination",        qty: "1", amount: "Included" },
      ],
      readinessIssue: "Scope summary is missing. Add this before sending.",
      sentDaysAgo: null,
      scopeSummary: null,
    },
  },

  /* ── C: Quote sent, waiting on customer ────────────────────────────── */
  {
    id: "alvarez",
    contact: "Maria Alvarez",
    project: "Kitchen remodel",
    source: "Referral",
    age: "11d",
    value: "$28,750",
    status: "Waiting on customer",
    statusTone: "sent",
    stage: "send",
    nextStep: "Send follow-up",
    nextStepReason:
      "The quote was sent 3 days ago. This is the right moment for a light follow-up.",
    risk: "May go cold",
    primaryAction: "Send follow-up",
    primaryOpensQuote: false,
    secondaryAction: "View quote",
    secondaryOpensQuote: true,
    customer: "Maria Alvarez",
    email: "maria.alvarez@gmail.com",
    phone: "(952) 555-0088",
    address: "8814 Birchwood Lane, Bloomington, MN",
    intakeNotes:
      "Full kitchen remodel with quartz, cabinetry, and island expansion. House will be occupied.",
    internalNotes: "Met in person Apr 29. Priority contact. James Barton referral.",
    timeline: [
      "Referral received",
      "Customer linked",
      "Quote sent",
      "No response yet",
    ],
    quote: {
      state: "sent",
      totalCents: 2_875_000,
      lineItems: [
        { description: "Kitchen remodel — full scope", qty: "1", amount: "$22,400" },
        { description: "Materials and fixtures",       qty: "1", amount: "$5,750"  },
        { description: "Permit and inspection",        qty: "1", amount: "$600"    },
      ],
      readinessIssue: null,
      sentDaysAgo: 3,
      scopeSummary:
        "Full kitchen remodel including quartz countertops, custom cabinetry, and island expansion. Clean jobsite protocol throughout — house will remain occupied.",
    },
  },

  /* ── D: Quote approved, deposit pending ────────────────────────────── */
  {
    id: "chen",
    contact: "Evelyn Chen",
    project: "Panel upgrade + EV charger",
    source: "Phone",
    age: "14d",
    value: "$8,900",
    status: "Approved",
    statusTone: "approved",
    stage: "approve",
    nextStep: "Confirm deposit",
    nextStepReason:
      "Customer approved the quote. The job should not activate until the deposit is confirmed.",
    risk: "Deposit pending",
    primaryAction: "Confirm deposit",
    primaryOpensQuote: false,
    secondaryAction: "Prepare activation",
    secondaryOpensQuote: false,
    customer: "Evelyn Chen",
    email: "evelyn.chen@gmail.com",
    phone: "(206) 555-0198",
    address: "7038 18th Ave NE, Seattle, WA",
    intakeNotes:
      "Service panel upgrade, EV charger, permit required. Customer wants completion before vehicle delivery.",
    internalNotes: null,
    timeline: [
      "Phone lead entered",
      "Customer linked",
      "Quote approved",
      "Deposit pending",
    ],
    quote: {
      state: "approved",
      totalCents: 890_000,
      lineItems: [
        { description: "Service panel upgrade (200A)", qty: "1", amount: "$6,200" },
        { description: "EV charger installation",      qty: "1", amount: "$2,700" },
      ],
      readinessIssue: null,
      sentDaysAgo: null,
      scopeSummary:
        "Upgrade residential electrical panel to 200A service. Install Level 2 EV charger in garage. All work includes permit and final inspection.",
    },
  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function dotStyle(tone: StatusBadgeTone): { background: string } {
  if (tone === "approved") return { background: "var(--success)" };
  if (tone === "draft")    return { background: "rgba(245, 158, 11, 0.75)" };
  return { background: "var(--foreground-subtle)" };
}

function filterLeads(leads: MockLead[], tab: ListTab): MockLead[] {
  switch (tab) {
    case "New":           return leads.filter((l) => l.quote.state === "none");
    case "Quoted":        return leads.filter((l) => l.quote.state === "draft" || l.quote.state === "sent");
    case "Won":           return leads.filter((l) => l.quote.state === "approved");
    case "Action needed": return leads.filter((l) => l.quote.state !== "approved");
    default:              return leads;
  }
}

/* ─── Stage tracker ──────────────────────────────────────────────────────── */

function StageTracker({ current }: { current: Stage }) {
  const ci = STAGE_IDX[current];
  return (
    <nav aria-label="Progress" className="flex items-start overflow-x-auto">
      {STAGES.map((s, i) => {
        const done   = i < ci;
        const active = i === ci;
        return (
          <div key={s.id} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1.5">
              <div
                aria-current={active ? "step" : undefined}
                className={[
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold select-none",
                  done
                    ? "bg-foreground text-accent-contrast"
                    : active
                    ? "bg-accent text-accent-contrast ring-2 ring-offset-1 ring-ring"
                    : "bg-surface border-2 border-border-strong text-foreground-subtle",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={[
                  "text-[11px] whitespace-nowrap",
                  done
                    ? "text-foreground-muted"
                    : active
                    ? "font-semibold text-foreground"
                    : "text-foreground-subtle",
                ].join(" ")}
              >
                {s.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={[
                  "h-px w-5 mx-1.5 mb-4 shrink-0",
                  i < ci ? "bg-foreground/25" : "bg-border-strong",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

/* ─── Mini timeline ──────────────────────────────────────────────────────── */

function MiniTimeline({ timeline }: { timeline: string[] }) {
  return (
    <div className="space-y-2">
      {timeline.map((item, idx) => {
        const isLatest = idx === timeline.length - 1;
        return (
          <div key={item} className="flex items-start gap-2">
            <div className="flex flex-col items-center pt-0.5 shrink-0">
              <div
                className={[
                  "w-2 h-2 rounded-full shrink-0",
                  isLatest ? "bg-foreground" : "bg-border-strong",
                ].join(" ")}
              />
              {idx < timeline.length - 1 && (
                <div className="w-px h-4 bg-border mt-0.5" />
              )}
            </div>
            <span
              className={[
                "text-sm leading-tight",
                isLatest ? "text-foreground font-medium" : "text-foreground-subtle",
              ].join(" ")}
            >
              {item}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Info field (static or clickable) ──────────────────────────────────── */

function InfoField({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-xs text-foreground-subtle mb-0.5">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg border border-border bg-surface p-3 text-left w-full hover:bg-background transition-colors"
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-3">{inner}</div>
  );
}

/* ─── Lead list row ──────────────────────────────────────────────── */

function LeadRow({
  lead,
  active,
  onOpen,
}: {
  lead: MockLead;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "w-full flex items-center gap-3 px-4 py-4 text-left transition-colors",
        active ? "bg-background" : "hover:bg-background/60",
      ].join(" ")}
    >
      <div
        className="w-2 h-2 rounded-full shrink-0 mt-0.5"
        style={dotStyle(lead.statusTone)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-foreground">
            {lead.contact}
          </span>
          <StatusBadge label={lead.status} tone={lead.statusTone} />
        </div>
        <p className="text-xs text-foreground-muted truncate mb-1.5">
          {lead.project}
        </p>
        <div className="flex flex-wrap gap-x-2 text-xs text-foreground-subtle">
          <span>{lead.source}</span>
          <span>·</span>
          <span>{lead.age}</span>
          <span>·</span>
          <span>{lead.value}</span>
          <span>·</span>
          <span>{lead.nextStep}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground-subtle hover:border-border-strong hover:text-foreground transition-colors">
        Open
        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
      </div>
    </button>
  );
}

/* ─── Overview tab ───────────────────────────────────────────────────────── */

function OverviewTab({
  lead,
  onSwitchToQuote,
}: {
  lead: MockLead;
  onSwitchToQuote: () => void;
}) {
  const quoteStateLabel: Record<QuoteData["state"], string> = {
    none:     "Not started",
    draft:    "Draft",
    sent:     "Sent",
    approved: "Approved",
  };

  return (
    <div className="space-y-4">
      {/* Next step */}
      <div className="rounded-xl border border-border bg-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">
              Next step
            </p>
            <h3 className="mt-1.5 text-lg font-semibold text-foreground leading-snug">
              {lead.nextStep}
            </h3>
            <p className="mt-1 text-sm text-foreground-muted leading-relaxed max-w-xl">
              {lead.nextStepReason}
            </p>
          </div>
          {lead.risk && (
            <div
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
              style={{
                background: "rgba(245, 158, 11, 0.1)",
                border:     "1px solid rgba(245, 158, 11, 0.25)",
                color:      "#92400e",
              }}
            >
              {lead.risk}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={lead.primaryOpensQuote ? onSwitchToQuote : undefined}
            className="rounded-lg bg-foreground text-accent-contrast text-sm font-semibold px-4 py-2.5 hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            {lead.primaryAction}
            <ArrowRight className="w-4 h-4 opacity-60" strokeWidth={2} />
          </button>
          {lead.secondaryAction && (
            <button
              type="button"
              onClick={lead.secondaryOpensQuote ? onSwitchToQuote : undefined}
              className="rounded-lg border border-border bg-surface text-foreground-muted text-sm px-4 py-2.5 hover:text-foreground hover:border-border-strong transition-colors"
            >
              {lead.secondaryAction}
            </button>
          )}
        </div>
      </div>

      {/* 4-field summary */}
      <div className="grid grid-cols-4 gap-3">
        <InfoField label="Customer" value={lead.customer ?? "Not linked"} />
        <InfoField
          label="Quote"
          value={quoteStateLabel[lead.quote.state]}
          onClick={onSwitchToQuote}
        />
        <InfoField label="Source" value={lead.source} />
        <InfoField label="Job site" value={lead.address ?? "Not set"} />
      </div>

      {/* Stage tracker */}
      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <StageTracker current={lead.stage} />
      </div>

      {/* Job summary + activity */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2.5">
            Job summary
          </p>
          <p className="text-sm text-foreground-muted leading-relaxed">
            {lead.intakeNotes}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-3">
            Latest movement
          </p>
          <MiniTimeline timeline={lead.timeline} />
        </div>
      </div>
    </div>
  );
}

/* ─── Contact tab ────────────────────────────────────────────────────────── */

function ContactTab({ lead }: { lead: MockLead }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">
            Email
          </p>
          <a
            href={`mailto:${lead.email}`}
            className="text-sm text-foreground-muted hover:text-foreground transition-colors break-all"
          >
            {lead.email}
          </a>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">
            Phone
          </p>
          <a
            href={`tel:${lead.phone}`}
            className="text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            {lead.phone}
          </a>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">
            Address
          </p>
          <p className="text-sm text-foreground-muted">
            {lead.address ?? "Not provided"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">
          Customer
        </p>
        <div className="flex items-center justify-between">
          {lead.customer ? (
            <>
              <p className="text-sm font-medium text-foreground">{lead.customer}</p>
              <StatusBadge label="Linked" tone="approved" />
            </>
          ) : (
            <>
              <p className="text-sm text-foreground-muted">Not linked</p>
              <button
                type="button"
                className="text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Create customer from lead
              </button>
            </>
          )}
        </div>
      </div>

      {lead.internalNotes && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">
            Internal notes
          </p>
          <p className="text-sm text-foreground-muted leading-relaxed">
            {lead.internalNotes}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Activity tab ───────────────────────────────────────────────────────── */

function ActivityTab({ lead }: { lead: MockLead }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-4">
        Activity
      </p>
      <MiniTimeline timeline={lead.timeline} />
    </div>
  );
}

/* ─── Quote tab ──────────────────────────────────────────────────────────── */

function QuoteTab({
  lead,
  scopeSummary,
  onScopeSummaryChange,
}: {
  lead: MockLead;
  scopeSummary: string;
  onScopeSummaryChange: (v: string) => void;
}) {
  const { quote } = lead;
  const canStart = lead.customer !== null;

  /* Empty state */
  if (quote.state === "none") {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center space-y-3">
        <p className="text-sm font-medium text-foreground">No quote started</p>
        <p className="text-xs text-foreground-subtle max-w-xs leading-relaxed">
          {canStart
            ? "Start a quote for this lead when ready."
            : "Link a customer first, then start a quote."}
        </p>
        <button
          type="button"
          disabled={!canStart}
          className={[
            "rounded-lg text-sm font-semibold px-4 py-2.5 transition-opacity",
            canStart
              ? "bg-foreground text-accent-contrast hover:opacity-90"
              : "bg-foreground/20 text-foreground/40 cursor-not-allowed",
          ].join(" ")}
        >
          Start quote
        </button>
      </div>
    );
  }

  const statusTone: StatusBadgeTone =
    quote.state === "approved" ? "approved"
    : quote.state === "sent"   ? "sent"
    :                            "draft";

  const statusLabel =
    quote.state === "approved" ? "Approved"
    : quote.state === "sent"   ? "Sent"
    :                            "Draft";

  return (
    <div className="space-y-5">
      {/* Status row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge label={statusLabel} tone={statusTone} />
          {quote.totalCents > 0 && (
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {money(quote.totalCents)}
            </span>
          )}
          {quote.sentDaysAgo != null && (
            <span className="text-xs text-foreground-subtle">
              · sent {quote.sentDaysAgo} day{quote.sentDaysAgo !== 1 ? "s" : ""} ago
            </span>
          )}
        </div>
        <button
          type="button"
          className="text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors shrink-0"
        >
          Open full quote page
        </button>
      </div>

      {/* Readiness alert */}
      {quote.readinessIssue && (
        <div
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            background: "rgba(245, 158, 11, 0.07)",
            border:     "1px solid rgba(245, 158, 11, 0.22)",
            color:      "#92400e",
          }}
        >
          <span className="shrink-0">⚠</span>
          <span>{quote.readinessIssue}</span>
        </div>
      )}

      {/* Line items */}
      {quote.lineItems.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="border-b border-border bg-background px-4 py-2.5">
            <p className="text-sm font-medium text-foreground">Line items</p>
          </div>
          <div className="divide-y divide-border">
            {quote.lineItems.map((row) => (
              <div
                key={row.description}
                className="grid grid-cols-[1fr_4rem_7rem] gap-3 px-4 py-3 text-sm"
              >
                <p className="text-foreground">{row.description}</p>
                <p className="text-foreground-muted">{row.qty}</p>
                <p className="text-right font-medium text-foreground">
                  {row.amount}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-border bg-background px-4 py-2.5 text-right">
            <span className="text-sm font-semibold text-foreground">
              Total: {money(quote.totalCents)}
            </span>
          </div>
        </div>
      )}

      {/* Customer-facing scope summary */}
      {(quote.state === "draft" || quote.state === "sent") && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
          <label className="block text-xs font-medium text-foreground-subtle uppercase tracking-wide">
            Customer-facing scope summary
          </label>
          <textarea
            value={scopeSummary}
            onChange={(e) => onScopeSummaryChange(e.target.value)}
            readOnly={quote.state === "sent"}
            placeholder="Write the scope summary the customer will see on the quote…"
            rows={4}
            className="w-full min-h-[96px] resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {/* Approved scope (read-only) */}
      {quote.state === "approved" && quote.scopeSummary && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">
            Scope summary
          </p>
          <p className="text-sm text-foreground-muted leading-relaxed">
            {quote.scopeSummary}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {quote.state === "draft" && (
          <>
            <button
              type="button"
              className="rounded-lg bg-foreground text-accent-contrast text-sm font-semibold px-4 py-2.5 hover:opacity-90 transition-opacity"
            >
              Save changes
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-surface text-foreground-muted text-sm px-4 py-2.5 hover:text-foreground hover:border-border-strong transition-colors"
            >
              Preview
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-surface text-foreground-muted text-sm px-4 py-2.5 hover:text-foreground hover:border-border-strong transition-colors"
            >
              Send
            </button>
          </>
        )}
        {quote.state === "sent" && (
          <>
            <button
              type="button"
              className="rounded-lg bg-foreground text-accent-contrast text-sm font-semibold px-4 py-2.5 hover:opacity-90 transition-opacity"
            >
              Follow up
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-surface text-foreground-muted text-sm px-4 py-2.5 hover:text-foreground hover:border-border-strong transition-colors"
            >
              Mark approved
            </button>
          </>
        )}
        {quote.state === "approved" && (
          <button
            type="button"
            className="rounded-lg text-sm font-semibold px-4 py-2.5 hover:opacity-90 transition-opacity"
            style={{ background: "var(--success)", color: "#fff" }}
          >
            Activate job
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Workspace content (rendered inside <dialog>) ───────────────────────── */

function WorkspaceContent({
  lead,
  activeTab,
  setActiveTab,
  onClose,
}: {
  lead: MockLead;
  activeTab: WorkspaceTab;
  setActiveTab: (t: WorkspaceTab) => void;
  onClose: () => void;
}) {
  /* Scope summary state lives here so it survives tab switches */
  const [scopeSummary, setScopeSummary] = useState(
    lead.quote.scopeSummary ?? "",
  );

  return (
    <div className="flex max-h-[88vh] flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        {/* Top row: badges + value + close */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <StatusBadge label={lead.status} tone={lead.statusTone} />
            <span className="text-xs text-foreground-subtle">
              {lead.source} · {lead.age}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-lg border border-border bg-background px-4 py-2 text-right">
              <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wide leading-none mb-0.5">
                Value
              </p>
              <p className="text-lg font-semibold text-foreground tabular-nums leading-tight">
                {lead.value}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close workspace"
              className="rounded-lg border border-border bg-surface p-2 text-foreground-subtle hover:text-foreground hover:bg-background transition-colors"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Identity */}
        <div className="mt-4">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight leading-tight">
            {lead.customer ?? lead.contact}
          </h2>
          <p className="text-sm text-foreground-muted mt-0.5">{lead.project}</p>
        </div>

        {/* Tab bar */}
        <div className="mt-4 inline-flex rounded-lg bg-background p-1 gap-0.5">
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
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === "overview" && (
          <OverviewTab
            lead={lead}
            onSwitchToQuote={() => setActiveTab("quote")}
          />
        )}
        {activeTab === "contact"  && <ContactTab  lead={lead} />}
        {activeTab === "activity" && <ActivityTab lead={lead} />}
        {activeTab === "quote" && (
          <QuoteTab
            lead={lead}
            scopeSummary={scopeSummary}
            onScopeSummaryChange={setScopeSummary}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function LeadFlowPreviewPage() {
  const dialogRef   = useRef<HTMLDialogElement>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<WorkspaceTab>("overview");
  const [listTab,    setListTab]    = useState<ListTab>("Action needed");

  const openLead     = MOCK_LEADS.find((l) => l.id === openLeadId) ?? null;
  const visibleLeads = filterLeads(MOCK_LEADS, listTab);

  /* Sync native dialog open/close with React state */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openLeadId && !dialog.open) {
      dialog.showModal();
    } else if (!openLeadId && dialog.open) {
      dialog.close();
    }
  }, [openLeadId]);

  /* Sync state when user presses Escape (native cancel event) */
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
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

      {/* ── Preview notice ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-surface px-4 py-2.5 flex items-center justify-between gap-4">
        <p className="text-xs text-foreground-muted">
          <span className="font-semibold text-foreground">Lead Flow Preview</span>
          {" "}· Design exploration · Mock data only · Not connected to production
        </p>
        <span className="text-xs text-foreground-subtle font-mono shrink-0">
          /lead-flow-preview
        </span>
      </div>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Leads
        </h1>
      </div>

      {/* ── Lead list ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground-subtle">
            <Search className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            <span>Search leads, customer, address…</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-3 py-2.5 border-b border-border flex gap-1 overflow-x-auto">
          {LIST_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setListTab(t)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                listTab === t
                  ? "bg-foreground text-accent-contrast"
                  : "text-foreground-subtle hover:text-foreground",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Rows */}
        {visibleLeads.length > 0 ? (
          <div className="divide-y divide-border">
            {visibleLeads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                active={lead.id === openLeadId}
                onOpen={() => openWorkspace(lead.id)}
              />
            ))}
          </div>
        ) : (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-foreground-subtle">
              No leads in this filter.
            </p>
          </div>
        )}
      </div>

      {/* ── Customer / Lead Workspace modal ─────────────────────── */}
      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl outline-none [&::backdrop]:bg-foreground/30"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeWorkspace();
        }}
      >
        {openLead && (
          <WorkspaceContent
            lead={openLead}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onClose={closeWorkspace}
          />
        )}
      </dialog>

    </div>
  );
}

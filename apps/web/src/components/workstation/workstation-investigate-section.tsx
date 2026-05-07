import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CircleAlert,
  CreditCard,
  FileText,
  Inbox,
  ListTodo,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  type WorkstationInvestigateRecordType,
  type WorkstationInvestigateSeverity,
  type WorkstationInvestigateSignal,
} from "@/lib/workstation-investigate-signals";

const RECORD_ICONS: Record<WorkstationInvestigateRecordType, LucideIcon> = {
  lead: Inbox,
  quote: FileText,
  job: Briefcase,
  customer: UserRound,
  payment: CreditCard,
  activity: ListTodo,
};

const RECORD_LABELS: Record<WorkstationInvestigateRecordType, string> = {
  lead: "Lead",
  quote: "Quote",
  job: "Job",
  customer: "Customer",
  payment: "Payment",
  activity: "Activity",
};

const SEVERITY_PILL_CLASS: Record<WorkstationInvestigateSeverity, string> = {
  high: "border-danger/30 bg-danger/10 text-danger",
  medium: "border-border-strong bg-foreground/[0.04] text-foreground",
  low: "border-border bg-foreground/[0.02] text-foreground-muted",
};

const SEVERITY_LABEL: Record<WorkstationInvestigateSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const primaryActionClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const secondaryActionClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const cardClass =
  "rounded-lg border border-border bg-foreground/[0.015] px-4 py-3 transition-colors hover:border-border-strong hover:bg-foreground/[0.03]";

function WorkstationInvestigateCard({
  signal,
}: {
  signal: WorkstationInvestigateSignal;
}) {
  const RecordIcon = RECORD_ICONS[signal.recordType];
  const isPreview = signal.origin === "preview";

  return (
    <article className={cardClass}>
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-foreground-subtle"
          aria-hidden
        >
          <RecordIcon className="size-3.5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              {RECORD_LABELS[signal.recordType]}
            </span>
            <span
              className={[
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide",
                SEVERITY_PILL_CLASS[signal.severity],
              ].join(" ")}
              title="Investigate severity"
            >
              {SEVERITY_LABEL[signal.severity]}
            </span>
            {isPreview ? (
              <span
                className="inline-flex items-center rounded-md border border-dashed border-border px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle"
                title="Illustrative preview — not derived from live data yet"
              >
                Preview
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-foreground">
            {signal.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            {signal.recordLabel}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
            {signal.reason}
          </p>
          <p className="mt-1 text-xs text-foreground-subtle">
            <span className="font-medium text-foreground-muted">Suggested:</span>{" "}
            {signal.suggestedAction}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={signal.href} className={primaryActionClass}>
              {signal.primaryActionLabel}
              <ArrowRight className="size-3.5" />
            </Link>
            {signal.secondaryHref && signal.secondaryActionLabel ? (
              <Link href={signal.secondaryHref} className={secondaryActionClass}>
                {signal.secondaryActionLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export type WorkstationInvestigateSectionProps = {
  derivedSignals: readonly WorkstationInvestigateSignal[];
  previewSignals: readonly WorkstationInvestigateSignal[];
};

export function WorkstationInvestigateSection({
  derivedSignals,
  previewSignals,
}: WorkstationInvestigateSectionProps) {
  const hasDerived = derivedSignals.length > 0;
  const hasPreview = previewSignals.length > 0;

  return (
    <WorkspacePanel padding="compact" className="border-border-strong">
      <SectionHeading
        title="Investigate"
        description="Records that look unclear, risky, or missing context—review them before they become tasks."
      />

      {hasDerived ? (
        <div className="space-y-2">
          {derivedSignals.map((signal) => (
            <WorkstationInvestigateCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-5">
          <p className="text-sm font-medium text-foreground">
            No investigation signals right now.
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            Struxient will surface unclear, risky, or missing-context items here before
            they become tasks. Only org-scoped lead linkage is wired today.
          </p>
        </div>
      )}

      {hasPreview ? (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-3 flex items-start gap-2">
            <CircleAlert
              className="mt-0.5 size-3.5 shrink-0 text-foreground-subtle"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-foreground-subtle">
              Preview cards illustrate the categories the Investigate lane will surface
              once duplicate detection, quote readiness scans, payment, and activity
              feeds are wired. Not derived from live records.
            </p>
          </div>
          <div className="space-y-2">
            {previewSignals.map((signal) => (
              <WorkstationInvestigateCard key={signal.id} signal={signal} />
            ))}
          </div>
        </div>
      ) : null}
    </WorkspacePanel>
  );
}

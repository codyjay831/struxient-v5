import {
  Briefcase,
  ChevronRight,
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
import { AttentionCard } from "@/components/ui/attention-card";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { buildWorkstationHref } from "@/lib/workstation-return-href";
import {
  type WorkstationInvestigateRecordType,
  type WorkstationInvestigateSignal,
} from "@/lib/workstation-investigate-signals";

const RECORD_ICONS: Record<WorkstationInvestigateRecordType, LucideIcon> = {
  "lead": Inbox,
  quote: FileText,
  job: Briefcase,
  customer: UserRound,
  payment: CreditCard,
  activity: ListTodo,
};

const RECORD_LABELS: Record<WorkstationInvestigateRecordType, string> = {
  "lead": "Lead",
  quote: "Quote",
  job: "Job",
  customer: "Customer",
  payment: "Payment",
  activity: "Activity",
};

function InvestigateAttentionCard({
  signal,
}: {
  signal: WorkstationInvestigateSignal;
}) {
  // Derived signals get return context so destination pages can surface a
  // "Back to Workstation" link. Preview signals point to illustrative targets
  // only; apply context to those too for consistency.
  const contextHref = buildWorkstationHref(signal.href, "investigate");
  const contextSecondaryHref = signal.secondaryHref
    ? buildWorkstationHref(signal.secondaryHref, "investigate")
    : undefined;

  return (
    <AttentionCard
      title={signal.title}
      eyebrow={RECORD_LABELS[signal.recordType]}
      icon={RECORD_ICONS[signal.recordType]}
      recordLabel={signal.recordLabel}
      severity={signal.severity}
      reason={signal.reason}
      suggestedAction={signal.suggestedAction}
      href={contextHref}
      secondaryHref={contextSecondaryHref}
      secondaryActionLabel={signal.secondaryActionLabel}
      origin={signal.origin}
    />
  );
}

export type WorkstationInvestigateSectionProps = {
  derivedSignals: readonly WorkstationInvestigateSignal[];
  previewSignals: readonly WorkstationInvestigateSignal[];
  /** Optional id to make the section scroll-anchor-able from a SummaryStrip. */
  id?: string;
};

export function WorkstationInvestigateSection({
  derivedSignals,
  previewSignals,
  id,
}: WorkstationInvestigateSectionProps) {
  const hasDerived = derivedSignals.length > 0;
  const hasPreview = previewSignals.length > 0;

  return (
    <WorkspacePanel id={id} padding="compact" className="border-border-strong scroll-mt-6">
      <SectionHeading
        title={WORKSTATION_COPY.investigate.sectionTitle}
        description={WORKSTATION_COPY.investigate.sectionDescription}
      />

      {/* Live derived signals */}
      {hasDerived ? (
        <div className="space-y-3">
          {derivedSignals.map((signal) => (
            <InvestigateAttentionCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-5">
          <p className="text-sm font-medium text-foreground">
            {WORKSTATION_COPY.investigate.emptyTitle}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            {WORKSTATION_COPY.investigate.emptyDescription}
          </p>
        </div>
      )}

      {/* Preview signals — collapsed by default when live signals exist so they
          don't compete for attention. Open by default when there are no live
          signals so the section doesn't look empty. */}
      {hasPreview ? (
        <details
          open={!hasDerived}
          className="group mt-5 border-t border-border pt-4"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden
            />
            <span>{WORKSTATION_COPY.investigate.previewSectionTitle}</span>
            <CircleAlert
              className="ml-0.5 size-3 shrink-0 text-foreground-subtle"
              strokeWidth={1.5}
              aria-hidden
            />
          </summary>

          <div className="mt-3">
            <p className="mb-3 text-xs leading-relaxed text-foreground-subtle">
              {WORKSTATION_COPY.investigate.previewSectionLead}
            </p>
            <div className="space-y-2">
              {previewSignals.map((signal) => (
                <InvestigateAttentionCard key={signal.id} signal={signal} />
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </WorkspacePanel>
  );
}

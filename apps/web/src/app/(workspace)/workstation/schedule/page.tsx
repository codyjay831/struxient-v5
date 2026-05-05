import { SectionHeader } from "@/components/shell/section-header";

export default function WorkstationScheduleLensPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Workstation · Schedule lens"
        title="Schedule"
        description="Attention-first: near-term schedule risk, slips, and items that need a decision—not the planning/browse calendar. For coordination and future calendar density, use Work → Schedule (/schedule)."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        This Workstation lens stays focused on what needs eyes soon. The Work → Schedule
        route is the coordination and record surface as the calendar engine matures.
      </div>
    </div>
  );
}

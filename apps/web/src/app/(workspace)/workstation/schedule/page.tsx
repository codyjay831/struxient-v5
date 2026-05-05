import { SectionHeader } from "@/components/shell/section-header";

export default function WorkstationScheduleLensPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Schedule lens"
        title="Schedule"
        description="Month / week / day from tasks and appointments; drag-reschedule will update persisted records when they exist. For the full schedule record surface, use Work → Schedule (/schedule)."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        This lens highlights schedule risk and near-term changes first; the
        calendar-first record view lives under Work → Schedule.
      </div>
    </div>
  );
}

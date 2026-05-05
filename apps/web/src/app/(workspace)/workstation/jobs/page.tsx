import { SectionHeader } from "@/components/shell/section-header";

export default function WorkstationJobsLensPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Jobs lens"
        title="Jobs"
        description="Job-centric attention into executable state: scheduled, active, on hold, complete—aligned to locked lifecycle §2."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        Job list and drill-down will appear here after persistence exists.
      </div>
    </div>
  );
}

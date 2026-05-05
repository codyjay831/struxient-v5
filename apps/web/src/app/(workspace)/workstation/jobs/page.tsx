import { SectionHeader } from "@/components/shell/section-header";

export default function WorkstationJobsLensPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Jobs lens"
        title="Jobs"
        description="Job-centric attention into executable state: scheduled, active, on hold, complete. For the full job record directory, use Work → Jobs in the sidebar (/jobs)."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        Attention-scoped job list and drill-down will appear here after persistence
        exists—counts and filters differ from the /jobs directory view.
      </div>
    </div>
  );
}

import { SectionHeader } from "@/components/shell/section-header";

export default function WorkstationTasksLensPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Tasks lens"
        title="Tasks"
        description="Cross-job task views: assigned, unassigned, blocked—filtered by role and crew when RBAC and server queries exist."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        Schema and queries not wired yet. See{" "}
        <code className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-xs">
          docs/build-concerns-risks-and-gaps.md
        </code>{" "}
        for build gaps and sequencing notes.
      </div>
    </div>
  );
}

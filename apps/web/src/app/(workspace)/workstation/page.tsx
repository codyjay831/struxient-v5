import { SectionHeader } from "@/components/shell/section-header";

export default function WorkstationTodayLensPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Today lens"
        title="Today"
        description="Assigned work, blockers, overdue, and what changed—matches locked default landing §11 once data exists."
      />

      <section className="rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.15em] text-foreground-subtle">
          Next actions
        </h2>
        <ul className="space-y-4 text-sm text-foreground-muted">
          <li className="flex gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
            <span className="w-24 shrink-0 text-foreground-subtle">Blocked</span>
            <span>No blockers synced yet.</span>
          </li>
          <li className="flex gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
            <span className="w-24 shrink-0 text-foreground-subtle">Due</span>
            <span>No tasks in range—connect Prisma and org-scoped queries.</span>
          </li>
          <li className="flex gap-4">
            <span className="w-24 shrink-0 text-foreground-subtle">Changed</span>
            <span>Activity feed will land with events (I7, I16).</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

import { SectionHeader } from "@/components/shell/section-header";

export default function WorkstationScheduleLensPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Schedule lens"
        title="Schedule"
        description="Month / week / day from tasks and appointments; drag reschedule updates the server record (locked §5)."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        Calendar UI is a later slice; task date fields come first.
      </div>
    </div>
  );
}

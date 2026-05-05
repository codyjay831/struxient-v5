import { SectionHeader } from "@/components/shell/section-header";

export default function LeadsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeader
        eyebrow="Commercial"
        title="Leads"
        description="Inbox, dedupe warn-only, optional assignment rules—see locked intake §4 and experience canon."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        Lead model and forms not created yet.
      </div>
    </div>
  );
}

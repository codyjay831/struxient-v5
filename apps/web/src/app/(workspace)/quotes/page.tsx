import { SectionHeader } from "@/components/shell/section-header";

export default function QuotesPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeader
        eyebrow="Commercial"
        title="Quotes"
        description="Draft through approved with immutable snapshot at approval (I2, locked §7)—commercial anchor for jobs."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        Quote authoring surface will replace this placeholder.
      </div>
    </div>
  );
}

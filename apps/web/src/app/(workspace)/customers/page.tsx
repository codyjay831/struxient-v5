import { SectionHeader } from "@/components/shell/section-header";

export default function CustomersPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeader
        eyebrow="Commercial"
        title="Customers"
        description="Durable parties you do business with; tags over false rigidity (I12, conceptual model)."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        CRM-light directory—post leads + quote linkage.
      </div>
    </div>
  );
}

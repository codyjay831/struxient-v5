import { SectionHeader } from "@/components/shell/section-header";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeader
        eyebrow="Organization"
        title="Settings"
        description="Org profile, integrations, payment rules, and template library—Admin/Owner gates per locked RBAC §1."
      />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center text-sm text-foreground-muted">
        No settings mutations until auth and org context exist.
      </div>
    </div>
  );
}

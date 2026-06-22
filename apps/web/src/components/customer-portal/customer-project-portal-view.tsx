import { CustomerPortalScheduleCard } from "@/components/customer-portal/customer-portal-schedule-card";
import { CustomerPortalDocumentsSection } from "@/components/customer-portal/customer-portal-documents-section";
import { CustomerPortalPaymentsSection } from "@/components/customer-portal/customer-portal-payments-section";
import {
  CustomerPortalNextActionButton,
  CustomerPortalQuoteChangeOrderSection,
} from "@/components/customer-portal/customer-portal-commercial-actions";
import type { CustomerProjectPortalDocument } from "@/lib/customer-portal/presenter";

export function CustomerProjectPortalView({
  document,
  accessId,
  showStaffPreviewBanner = false,
}: {
  document: CustomerProjectPortalDocument;
  accessId: string;
  showStaffPreviewBanner?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-xl">
          {showStaffPreviewBanner ? (
            <p className="mb-3 rounded-lg border border-border bg-surface-elevated/60 px-3 py-2 text-xs text-foreground-muted">
              Staff preview — customer-safe projection only.
            </p>
          ) : null}
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
            Your project
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {document.header.projectTitle}
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">{document.header.companyName}</p>
          {document.header.projectAddress ? (
            <p className="mt-1 text-sm text-foreground-muted">{document.header.projectAddress}</p>
          ) : null}
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            {document.header.portalStatusLabel}
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 sm:px-8">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-elevated)]">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Next step</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{document.nextAction.label}</h2>
          {document.nextAction.description ? (
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
              {document.nextAction.description}
            </p>
          ) : null}
          {document.nextAction.href ||
          document.nextAction.action === "OPEN_QUOTE" ||
          document.nextAction.action === "OPEN_CHANGE_ORDER" ? (
            <div className="mt-4">
              <CustomerPortalNextActionButton accessId={accessId} nextAction={document.nextAction} />
            </div>
          ) : null}
        </section>

        <PortalCard title="Schedule">
          <CustomerPortalScheduleCard accessId={accessId} schedule={document.schedule} />
        </PortalCard>

        <PortalCard title="Quote & change orders">
          <CustomerPortalQuoteChangeOrderSection
            accessId={accessId}
            quotes={document.quotes}
            changeOrders={document.changeOrders}
          />
        </PortalCard>

        <PortalCard title="Payments">
          <CustomerPortalPaymentsSection
            accessId={accessId}
            payments={document.payments}
            companyName={document.contact.companyName}
          />
        </PortalCard>

        <PortalCard title="Documents & photos">
          <CustomerPortalDocumentsSection accessId={accessId} documents={document.documents} />
        </PortalCard>

        <PortalCard title="Requests">
          {document.requests.length === 0 ? (
            <EmptyState text="You have not submitted any requests yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {document.requests.map((request) => (
                <li key={request.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium text-foreground">{request.title}</p>
                  <p className="text-foreground-muted">{request.status.toLowerCase()}</p>
                </li>
              ))}
            </ul>
          )}
        </PortalCard>

        <PortalCard title="Project history">
          {document.activity.length === 0 ? (
            <EmptyState text="Project activity will appear here as things happen." />
          ) : (
            <ul className="space-y-2 text-sm text-foreground-muted">
              {document.activity.map((item) => (
                <li key={item.id}>
                  {item.label} · {item.createdAt.toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </PortalCard>

        <PortalCard title="Contact">
          <p className="text-sm text-foreground-muted">
            Questions about your project? Contact {document.contact.companyName} directly.
          </p>
        </PortalCard>
      </main>
    </div>
  );
}

function PortalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-foreground-muted">{text}</p>;
}

import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  INTAKE_CUSTOMER_FIELDS_PATH,
  INTAKE_PUBLIC_COPY_PATH,
  INTAKE_SPECIALIZED_PATH,
  INTAKE_STAFF_PATH,
} from "@/lib/intake-settings-hierarchy";

type ChecklistStatus = "complete" | "attention" | "incomplete";

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  status: ChecklistStatus;
  href: string;
  actionLabel: string;
};

const statusIcon: Record<ChecklistStatus, typeof CheckCircle2> = {
  complete: CheckCircle2,
  attention: AlertCircle,
  incomplete: Circle,
};

const statusIconClass: Record<ChecklistStatus, string> = {
  complete: "text-success",
  attention: "text-warning",
  incomplete: "text-foreground-subtle",
};

const rowLinkClass =
  "group flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-foreground/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function IntakeOverviewSetupChecklist({
  slug,
  publicLive,
  formTitle,
  hasIntro,
  hasSettingsRow,
  pageCopyCustomized,
  customerFieldCount,
  officeFormProvisioned,
  specializedFormCount,
}: {
  slug: string | null;
  publicLive: boolean;
  formTitle: string;
  hasIntro: boolean;
  hasSettingsRow: boolean;
  pageCopyCustomized: boolean;
  customerFieldCount: number;
  officeFormProvisioned: boolean;
  specializedFormCount: number;
}) {
  const items: ChecklistItem[] = [
    {
      id: "company-link",
      title: slug ? "Customer link ready" : "Company URL slug required",
      description: slug
        ? `Your link uses /request/${slug}`
        : "Set a company slug in Business profile before sharing.",
      status: slug ? "complete" : "incomplete",
      href: slug ? INTAKE_PUBLIC_COPY_PATH : "/settings/organization",
      actionLabel: slug ? "Edit page" : "Set slug",
    },
    {
      id: "accepting-requests",
      title: publicLive ? "Accepting customer requests" : "Customer requests paused",
      description: publicLive
        ? "Visitors can submit through your public page."
        : "Your link shows an unavailable message until you turn intake back on.",
      status: publicLive ? "complete" : "attention",
      href: INTAKE_PUBLIC_COPY_PATH,
      actionLabel: publicLive ? "Manage availability" : "Turn on",
    },
    {
      id: "page-copy",
      title: pageCopyCustomized ? `Page titled “${formTitle}”` : "Default page copy",
      description: hasIntro
        ? "Welcome message and page shell are configured."
        : hasSettingsRow
          ? "Add a welcome message so customers know what to expect."
          : "Stock title and welcome message — customize anytime.",
      status: hasIntro || !hasSettingsRow ? "complete" : "attention",
      href: INTAKE_PUBLIC_COPY_PATH,
      actionLabel: hasIntro ? "Edit page copy" : "Customize page",
    },
    {
      id: "customer-questions",
      title: `${customerFieldCount} customer question${customerFieldCount === 1 ? "" : "s"}`,
      description: "Fields customers answer on your public request page.",
      status: "complete",
      href: INTAKE_CUSTOMER_FIELDS_PATH,
      actionLabel: "Edit questions",
    },
    {
      id: "staff-intake",
      title: officeFormProvisioned ? "Staff intake ready" : "Staff intake not provisioned",
      description: officeFormProvisioned
        ? "Internal form for phone, walk-in, and referral leads."
        : "Open New lead once to create your internal intake form.",
      status: officeFormProvisioned ? "complete" : "incomplete",
      href: officeFormProvisioned ? INTAKE_STAFF_PATH : "/leads/new",
      actionLabel: officeFormProvisioned ? "Edit staff intake" : "Open New lead",
    },
    {
      id: "specialized-links",
      title:
        specializedFormCount > 0
          ? `${specializedFormCount} specialized link${specializedFormCount === 1 ? "" : "s"} active`
          : "No specialized links yet",
      description:
        specializedFormCount > 0
          ? "Campaign or trade-specific entry points that still create leads."
          : "Optional — create links for campaigns, trades, or service lines.",
      status: "complete",
      href: INTAKE_SPECIALIZED_PATH,
      actionLabel: specializedFormCount > 0 ? "Manage links" : "Add link",
    },
  ];

  const completeCount = items.filter((item) => item.status === "complete").length;

  return (
    <WorkspacePanel padding="compact">
      <SectionHeading
        title="Setup checklist"
        description={`${completeCount} of ${items.length} areas ready. Finish the rest when you have time — your main link works with defaults.`}
      />
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const Icon = statusIcon[item.status];
          return (
            <li key={item.id}>
              <Link href={item.href} className={rowLinkClass}>
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${statusIconClass[item.status]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">
                    {item.description}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-medium text-foreground-muted transition-colors group-hover:text-foreground">
                  {item.actionLabel}
                  <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </WorkspacePanel>
  );
}

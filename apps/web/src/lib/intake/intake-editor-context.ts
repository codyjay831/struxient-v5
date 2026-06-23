import { LeadChannel } from "@prisma/client";
import {
  INTAKE_SETTINGS_HUB_PATH,
  INTAKE_SPECIALIZED_PATH,
} from "@/lib/intake-settings-hierarchy";

export type IntakeEditorContext =
  | "defaultCustomerIntake"
  | "specializedCustomerForm"
  | "defaultInternalIntake";

export function resolveIntakeEditorContext(form: {
  channel: LeadChannel;
  isPublic: boolean;
  isDefault: boolean;
}): IntakeEditorContext {
  if (form.channel === LeadChannel.MANUAL && !form.isPublic) {
    return "defaultInternalIntake";
  }
  if (form.isDefault) {
    return "defaultCustomerIntake";
  }
  return "specializedCustomerForm";
}

export type IntakeEditorContextLabels = {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  showBackLink: boolean;
  structureLabel: string;
  surfaceMode: "public" | "staff";
  layoutMode: "progressive" | "compact";
};

export function intakeEditorContextLabels(
  context: IntakeEditorContext,
): IntakeEditorContextLabels {
  switch (context) {
    case "defaultCustomerIntake":
      return {
        title: "Customer questions",
        description:
          "Questions customers answer on your main customer request page. Page title, intro, and availability are edited under Customer request page.",
        backHref: INTAKE_SPECIALIZED_PATH,
        backLabel: "← Customer request links",
        showBackLink: true,
        structureLabel: "Customer questions",
        surfaceMode: "public",
        layoutMode: "progressive",
      };
    case "specializedCustomerForm":
      return {
        title: "Questions for this link",
        description:
          "Optional public entry point for campaigns, trade-specific pages, referral partners, or distinct service lines. Submissions follow the same Lead Review flow.",
        backHref: INTAKE_SPECIALIZED_PATH,
        backLabel: "← Customer request links",
        showBackLink: true,
        structureLabel: "Questions for this link",
        surfaceMode: "public",
        layoutMode: "progressive",
      };
    case "defaultInternalIntake":
      return {
        title: "Staff intake",
        description:
          "Staff-only form at /leads/new for phone, email, walk-in, and referral leads. Customers never see this surface.",
        backHref: INTAKE_SETTINGS_HUB_PATH,
        backLabel: "← Customer intake",
        showBackLink: false,
        structureLabel: "Staff intake fields",
        surfaceMode: "staff",
        layoutMode: "compact",
      };
  }
}

/** Group atoms by construction intake building block for editor UI. */
export const INTAKE_FIELD_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Contact",
    keys: ["contact.name", "contact.email", "contact.phone", "preferred.contactMethod"],
  },
  {
    label: "Jobsite",
    keys: ["address.service"],
  },
  {
    label: "Scope & request type",
    keys: ["request.type", "scope.text", "scope.photos"],
  },
  {
    label: "Timing",
    keys: ["timing.bucket", "timing.specificDate"],
  },
  {
    label: "Visit & access",
    keys: ["visit.requestedDate", "visit.window", "visit.notes"],
  },
  {
    label: "Consent",
    keys: ["consent.terms"],
  },
];

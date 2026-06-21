import { LeadChannel } from "@prisma/client";
import {
  INTAKE_CUSTOM_FORMS_PATH,
  INTAKE_OFFICE_FORM_PATH,
  INTAKE_SETTINGS_HUB_PATH,
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
  structureLabel: string;
  breadcrumbParent: { label: string; href: string };
  surfaceMode: "public" | "staff";
  layoutMode: "progressive" | "compact";
};

export function intakeEditorContextLabels(
  context: IntakeEditorContext,
): IntakeEditorContextLabels {
  switch (context) {
    case "defaultCustomerIntake":
      return {
        title: "Default customer intake fields",
        description:
          "Questions customers answer on your public request page. Page title, intro, and availability are edited separately under public page copy.",
        backHref: INTAKE_SETTINGS_HUB_PATH,
        backLabel: "Back to customer intake",
        structureLabel: "Customer intake fields",
        breadcrumbParent: { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
        surfaceMode: "public",
        layoutMode: "progressive",
      };
    case "specializedCustomerForm":
      return {
        title: "Specialized customer intake form",
        description:
          "Optional public entry point for campaigns, trade-specific pages, referral partners, or distinct service lines. Submissions follow the same Lead Review flow.",
        backHref: INTAKE_CUSTOM_FORMS_PATH,
        backLabel: "Back to specialized customer forms",
        structureLabel: "Specialized intake fields",
        breadcrumbParent: {
          label: "Specialized customer forms",
          href: INTAKE_CUSTOM_FORMS_PATH,
        },
        surfaceMode: "public",
        layoutMode: "progressive",
      };
    case "defaultInternalIntake":
      return {
        title: "Default internal intake fields",
        description:
          "Staff-only form at /leads/new for phone, email, walk-in, and referral leads. Customers never see this surface.",
        backHref: INTAKE_OFFICE_FORM_PATH,
        backLabel: "Back to internal intake",
        structureLabel: "Internal intake fields",
        breadcrumbParent: { label: "Internal intake", href: INTAKE_OFFICE_FORM_PATH },
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

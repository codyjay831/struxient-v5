import { LeadChannel } from "@prisma/client";

/**
 * Default Intake Form Definition.
 *
 * Used as a safe fallback for `/request/[companySlug]` when an org has not yet
 * published a custom IntakeFormDefinition (channel = WEB_FORM, isDefault, isPublic,
 * archivedAt = null). Mirrors the shape of `IntakeFormDefinition.schema` so the same
 * `IntakeFormRenderer` can render either the stored definition or this fallback.
 *
 * Field keys must come from `INTAKE_ATOMS` in `@/lib/intake/atoms`.
 */

export type IntakeFormFieldVisibilityRule = {
  fieldKey: string;
  equals?: string | number | boolean;
  in?: Array<string | number | boolean>;
  notEmpty?: boolean;
};

export type IntakeFormFieldRef = {
  key: string;
  visibleIf?: IntakeFormFieldVisibilityRule;
};

export type IntakeFormSection = {
  key: string;
  title: string;
  description?: string;
  fields: IntakeFormFieldRef[];
};

export type IntakeFormSchema = {
  sections: IntakeFormSection[];
};

export type IntakeFormDefinitionShape = {
  id: string;
  name: string;
  slug: string;
  channel: LeadChannel;
  isPublic: boolean;
  isDefault: boolean;
  schema: IntakeFormSchema;
};

export const DEFAULT_INTAKE_FORM_SCHEMA: IntakeFormSchema = {
  sections: [
    {
      key: "contact",
      title: "Your Info",
      description: "How should we get in touch?",
      fields: [
        { key: "contact.name" },
        { key: "contact.email" },
        { key: "contact.phone" },
      ],
    },
    {
      key: "project",
      title: "Project",
      description: "Tell us where the work is and what you need.",
      fields: [
        { key: "address.service" },
        { key: "request.type" },
        { key: "scope.text" },
        { key: "scope.photos" },
      ],
    },
    {
      key: "timing",
      title: "Timing",
      description: "When do you need it done?",
      fields: [
        { key: "timing.bucket" },
        {
          key: "timing.specificDate",
          visibleIf: { fieldKey: "timing.bucket", equals: "SPECIFIC_DATE" },
        },
      ],
    },
    {
      key: "consent",
      title: "Confirm",
      fields: [{ key: "consent.terms" }],
    },
  ],
};

export const DEFAULT_INTAKE_FORM_DEFINITION: IntakeFormDefinitionShape = {
  id: "__default__",
  name: "Service Request",
  slug: "default",
  channel: LeadChannel.WEB_FORM,
  isPublic: true,
  isDefault: true,
  schema: DEFAULT_INTAKE_FORM_SCHEMA,
};

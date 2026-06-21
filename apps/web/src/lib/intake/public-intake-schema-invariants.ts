import type { IntakeFormSchema, IntakeFormSection } from "@/lib/intake/default-intake-form";

/** Customer-facing message when public submit is missing service category (`request.type`). */
export const PUBLIC_SERVICE_CATEGORY_REQUIRED_MESSAGE =
  "Please choose a service category.";

/** Staff-facing message when a public form schema omits the required atom. */
export const PUBLIC_FORM_MISSING_REQUEST_TYPE_ERROR =
  "Public intake forms must include the Request type field so customers can choose a service category.";

/** Atoms that public intake forms must include in schema (not necessarily all visible on every step). */
export const PUBLIC_INTAKE_REQUIRED_ATOMS = ["request.type"] as const;

/** Public atoms that cannot be removed in the form editor. */
export const PUBLIC_INTAKE_LOCKED_ATOMS = new Set<string>(["request.type"]);

const SERVICE_SECTION_KEY_HINTS = [
  "project",
  "service",
  "roof",
  "hvac",
  "emergency",
  "details",
];

function collectSchemaAtomKeys(schema: IntakeFormSchema): Set<string> {
  const keys = new Set<string>();
  for (const section of schema.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (field.key) {
        keys.add(field.key);
      }
    }
  }
  return keys;
}

export function schemaIncludesAtom(schema: IntakeFormSchema, atomKey: string): boolean {
  return collectSchemaAtomKeys(schema).has(atomKey);
}

export function publicIntakeSchemaIncludesRequestType(schema: IntakeFormSchema): boolean {
  return schemaIncludesAtom(schema, "request.type");
}

export type PublicIntakeSchemaValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validatePublicIntakeSchema(
  schema: IntakeFormSchema,
): PublicIntakeSchemaValidationResult {
  if (!publicIntakeSchemaIncludesRequestType(schema)) {
    return { ok: false, error: PUBLIC_FORM_MISSING_REQUEST_TYPE_ERROR };
  }
  return { ok: true };
}

function findServiceSectionIndex(sections: IntakeFormSection[]): number {
  const hinted = sections.findIndex((section) =>
    SERVICE_SECTION_KEY_HINTS.some((hint) => section.key.includes(hint)),
  );
  if (hinted >= 0) {
    return hinted;
  }
  const withAddress = sections.findIndex((section) =>
    section.fields?.some((field) => field.key === "address.service"),
  );
  if (withAddress >= 0) {
    return withAddress;
  }
  return sections.length > 1 ? 1 : 0;
}

/**
 * Inserts `request.type` into the best service/details section when missing.
 * Used to repair legacy public schemas without inventing submit-time fake values.
 */
export function normalizePublicIntakeSchema(schema: IntakeFormSchema): IntakeFormSchema {
  if (publicIntakeSchemaIncludesRequestType(schema)) {
    return schema;
  }

  const sections = (schema.sections ?? []).map((section) => ({
    ...section,
    fields: [...(section.fields ?? [])],
  }));

  if (sections.length === 0) {
    return {
      sections: [
        {
          key: "project",
          title: "Project",
          fields: [{ key: "request.type" }],
        },
      ],
    };
  }

  const targetIndex = findServiceSectionIndex(sections);
  const target = sections[targetIndex];
  const addressIndex = target.fields.findIndex((field) => field.key === "address.service");
  const scopeIndex = target.fields.findIndex((field) => field.key === "scope.text");
  const insertAt =
    addressIndex >= 0
      ? addressIndex + 1
      : scopeIndex >= 0
        ? scopeIndex
        : target.fields.length;

  target.fields.splice(insertAt, 0, { key: "request.type" });
  return { sections };
}

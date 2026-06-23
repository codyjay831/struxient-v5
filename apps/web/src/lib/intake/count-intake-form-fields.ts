import type { IntakeFormSchema } from "@/lib/intake/default-intake-form";

export function countIntakeFormFields(schema: IntakeFormSchema): number {
  return (schema.sections ?? []).reduce(
    (sum, section) => sum + (section.fields?.length ?? 0),
    0,
  );
}

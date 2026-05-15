/** Server-enforced limits for reusable task templates (Scope Library). */
export const TASK_TEMPLATE_FIELD_LIMITS = {
  title: 200,
  instructions: 8_000,
} as const;

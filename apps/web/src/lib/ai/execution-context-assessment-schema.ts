import { z } from "zod";

export const ExecutionContextAssessmentSchema = z.object({
  foundContext: z.array(z.string()).default([]),
  missingContext: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});

export type ExecutionContextAssessment = z.infer<typeof ExecutionContextAssessmentSchema>;

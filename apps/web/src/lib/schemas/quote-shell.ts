import { z } from "zod";
import { QuoteStatus } from "@prisma/client";

export const QuoteShellSchema = z.object({
  title: z.string().min(1).max(500),
  customerId: z.string().nullable().optional(),
  status: z.nativeEnum(QuoteStatus).optional(),
  internalNotes: z.string().max(20000).nullable().optional(),
  customerDocumentTitle: z.string().max(500).nullable().optional(),
  presentation: z.object({
    title: z.string().max(500).optional(),
    introText: z.string().max(10000).optional(),
    expiryDays: z.number().optional(),
    brandingOverrides: z.record(z.string(), z.any()).optional(),
  }).optional(),
});

export type QuoteShell = z.infer<typeof QuoteShellSchema>;

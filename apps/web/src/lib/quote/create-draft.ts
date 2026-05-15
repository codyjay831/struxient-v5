import { db } from "../db";
import { QuoteStatus, Prisma } from "@prisma/client";
import { getRequestContextOrThrow } from "../auth-context";
import { QuoteShell, QuoteShellSchema } from "../schemas/quote-shell";

export interface CreateQuoteDraftResult {
  ok: boolean;
  quoteId?: string;
  error?: string;
}

/**
 * Creates a new draft quote.
 */
export async function createQuoteDraft(input: QuoteShell): Promise<CreateQuoteDraftResult> {
  const ctx = await getRequestContextOrThrow();

  const validated = QuoteShellSchema.parse(input);

  try {
    const result = await db.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          organizationId: ctx.organizationId,
          customerId: validated.customerId,
          leadId: validated.leadId,
          status: QuoteStatus.DRAFT,
          title: validated.title,
          internalNotes: validated.internalNotes,
          customerDocumentTitle: validated.customerDocumentTitle,
          presentation: validated.presentation as unknown as Prisma.InputJsonValue,
          subtotalCents: 0,
          totalCents: 0,
        },
      });

      if (validated.leadId) {
        await tx.lead.update({
          where: { id: validated.leadId, organizationId: ctx.organizationId },
          data: {
            status: "CONVERTED",
            convertedAt: new Date(),
          },
        });
      }

      return quote;
    });

    return { ok: true, quoteId: result.id };
  } catch (e) {
    console.error("Failed to create quote draft", e);
    return { ok: false, error: "Failed to create quote draft." };
  }
}

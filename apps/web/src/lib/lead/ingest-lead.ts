import { LeadInput, LeadInputSchema } from "../schemas/lead-input";
import { db } from "../db";
import { triageLead } from "./triage-lead";
import { deriveLeadTitle } from "./lead-projection";
import { Prisma, QuoteStatus } from "@prisma/client";
import { enqueueSideEffect } from "../queue/local-queue";
import { notifyLeadSubmitted } from "../notifications";
import { performApplyLineItemTemplateToQuoteTx } from "../quote-line-item-template-apply-tx";

export interface IngestLeadContext {
  organizationId: string;
  userId?: string;
  /**
   * Optional immutable snapshot of which `IntakeFormDefinition` the user actually
   * filled out. Stored under `signals.formSnapshot` so we can later reconstruct
   * exactly what the customer saw at submit time.
   */
  formSnapshot?: { formDefinitionId: string; capturedAt: string };
}

export type IngestedLead = {
  id: string;
  organizationId: string;
  title: string;
  contactName: string | null;
};

/**
 * The primary use case for creating a new lead from any channel.
 * Handles validation, triage (signals), atomic database save, and enqueues side effects.
 *
 * Persists `notes` and `sourceDetail` into the `signals` JSONB column — there
 * are no flat columns for them on the Lead model.
 */
export async function ingestLead(input: LeadInput, ctx: IngestLeadContext): Promise<IngestedLead> {
  const validated = LeadInputSchema.parse(input);
  const triageSignals = await triageLead(validated, ctx.organizationId);

  const mergedSignals = {
    ...triageSignals,
    ...(validated.notes ? { notes: validated.notes } : {}),
    ...(validated.sourceDetail ? { sourceDetail: validated.sourceDetail } : {}),
    ...(ctx.formSnapshot ? { formSnapshot: ctx.formSnapshot } : {}),
  };

  const lead = await db.$transaction(async (tx) => {
    const l = await tx.lead.create({
      data: {
        organizationId: ctx.organizationId,
        channel: validated.channel,
        status: "NEW",
        contact: validated.contact as unknown as Prisma.InputJsonValue,
        request: validated.request as unknown as Prisma.InputJsonValue,
        address: (validated.address ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        signals: mergedSignals as unknown as Prisma.InputJsonValue,
        publicClientKey: validated.publicClientKey ?? null,
      },
      select: { id: true, organizationId: true },
    });

    await tx.leadEvent.create({
      data: {
        leadId: l.id,
        type: "CREATED",
        payload: {
          input: validated,
          signals: mergedSignals,
        } as Prisma.InputJsonValue,
        actorUserId: ctx.userId,
      },
    });

    // 5. Visit Request
    if (validated.visitRequest) {
      await tx.leadVisitRequest.create({
        data: {
          organizationId: ctx.organizationId,
          leadId: l.id,
          requestedDate: validated.visitRequest.requestedDate,
          requestedWindow: validated.visitRequest.requestedWindow,
          notes: validated.visitRequest.notes,
        },
      });
    }

    // 6. Custom Fields
    if (validated.customFields) {
      for (const [fieldDefId, value] of Object.entries(validated.customFields)) {
        if (value.trim()) {
          await tx.leadCustomFieldValue.create({
            data: {
              leadId: l.id,
              fieldDefId,
              value: value.trim(),
            },
          });
        }
      }
    }

    return l;
  });

  const derivedTitle = deriveLeadTitle(
    validated.contact as unknown as Prisma.JsonValue,
    validated.request as unknown as Prisma.JsonValue,
  );
  const ingested: IngestedLead = {
    id: lead.id,
    organizationId: lead.organizationId,
    title: derivedTitle,
    contactName: validated.contact.name,
  };

  enqueueSideEffect(async () => {
    if (validated.attachmentIds && validated.attachmentIds.length > 0) {
      await db.attachment.updateMany({
        where: {
          id: { in: validated.attachmentIds },
          organizationId: ctx.organizationId,
          leadId: null,
        },
        data: {
          leadId: ingested.id,
          status: "READY",
        },
      });
    }

    if (
      validated.request.lockInInstantQuote &&
      validated.request.instantQuoteTemplateIds &&
      validated.request.instantQuoteTemplateIds.length > 0
    ) {
      await db.$transaction(async (tx) => {
        const quote = await tx.quote.create({
          data: {
            organizationId: ctx.organizationId,
            leadId: ingested.id,
            status: QuoteStatus.DRAFT,
            title: `Instant Quote — ${validated.contact.name || derivedTitle}`,
            subtotalCents: 0,
            totalCents: 0,
          },
        });

        for (const tid of validated.request.instantQuoteTemplateIds!) {
          await performApplyLineItemTemplateToQuoteTx(tx, quote.id, tid, ctx.organizationId);
        }
      });
    }

    await notifyLeadSubmitted({
      organizationId: ctx.organizationId,
      leadId: ingested.id,
      contactName: validated.contact.name || "Unknown",
      email: validated.contact.email || "",
      phone: validated.contact.phone || "",
      requestType: validated.request.type || "General Request",
    });

    /** Append a duplicate-candidate hint into signals.notes (no flat column exists). */
    if (triageSignals.duplicateCandidateIds.length > 0) {
      const candidates = await db.customer.findMany({
        where: { id: { in: triageSignals.duplicateCandidateIds } },
        select: { displayName: true },
      });
      const duplicateNote = `\n\n[System] Likely existing customer matches: ${candidates.map((m) => m.displayName).join(", ")}`;

      const previousNotes = typeof mergedSignals.notes === "string" ? mergedSignals.notes : "";
      await db.lead.update({
        where: { id: ingested.id },
        data: {
          signals: {
            ...mergedSignals,
            notes: previousNotes + duplicateNote,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  });

  return ingested;
}

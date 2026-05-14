import { db } from "../db";
import { Prisma, QuoteStatus } from "@prisma/client";
import { getRequestContextOrThrow } from "../auth-context";
import {
  getLeadCommercialProgress,
  type LeadProgressQuoteInput,
} from "../lead-commercial-progress";
import { prepareCustomerFromLead } from "../lead-create-customer";
import {
  attachIntakeServiceLocationToCustomerFromLead,
  intakeSnapshotForCustomerFromLead,
  formatPrimaryServiceLocationLineForQuoteNotes,
} from "../customer-service-location-from-lead";
import { readContact, readRequest, readSignals } from "./lead-projection";
import {
  performApplyLineItemTemplateToQuoteTx,
} from "../quote-line-item-template-apply-tx";

export interface PromoteLeadToQuoteResult {
  ok: boolean;
  quoteId?: string;
  reusedExisting?: boolean;
  error?: string;
}

/**
 * Promotes a lead (Lead) to a Quote.
 * Handles customer creation if necessary, links the lead to the customer,
 * and creates a draft quote with suggested templates.
 */
export async function promoteLeadToQuote(leadId: string): Promise<PromoteLeadToQuoteResult> {
  const ctx = await getRequestContextOrThrow();
  const id = leadId.trim();
  if (!id) {
    return { ok: false, error: "Missing lead record id." };
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id, organizationId: ctx.organizationId },
          select: {
            id: true,
            status: true,
            customerId: true,
            contact: true,
            request: true,
            address: true,
            signals: true,
            channel: true,
            convertedAt: true,
            quotes: {
              where: { status: { not: QuoteStatus.ARCHIVED } },
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                title: true,
                status: true,
                totalCents: true,
                updatedAt: true,
                _count: { select: { lineItems: true } },
                job: { select: { id: true, status: true, organizationId: true } },
              },
            },
          },
        });

        if (!lead) {
          return { ok: false, error: "That lead was not found in your organization." };
        }

        const contact = readContact(lead.contact);
        const request = readRequest(lead.request);
        const signals = readSignals(lead.signals);

        const progressQuoteInputs: LeadProgressQuoteInput[] = lead.quotes.map((q) => ({
          id: q.id,
          title: q.title,
          status: q.status,
          totalCents: q.totalCents,
          lineItemCount: q._count.lineItems,
          updatedAt: q.updatedAt,
          job:
            q.job && q.job.organizationId === ctx.organizationId
              ? { id: q.job.id, status: q.job.status }
              : null,
        }));

        const progress = getLeadCommercialProgress({
          lead: {
            status: lead.status,
            customerId: lead.customerId,
            email: contact.email,
            phone: contact.phone,
          },
          quotes: progressQuoteInputs,
        });

        if (progress.isTerminal) {
          return {
            ok: false,
            error:
              "This lead is archived or closed. Open the full lead record if you need to change its status before starting a quote.",
          };
        }

        if (progress.activeQuote) {
          // Ensure lead is graduated even if we reuse an existing quote
          await tx.lead.update({
            where: { id: lead.id },
            data: {
              status: "CONVERTED",
              convertedAt: lead.convertedAt ?? new Date(),
            },
          });

          return {
            ok: true,
            quoteId: progress.activeQuote.id,
            reusedExisting: true,
          };
        }

        let resolvedCustomerId = lead.customerId;

        // 1. Atomic Promotion: Create customer if missing
        if (!resolvedCustomerId) {
          const prep = prepareCustomerFromLead({
            title: request.type || "Lead",
            contactName: contact.name,
            email: contact.email,
            phone: contact.phone,
            notes: signals?.notes || "",
            channel: lead.channel,
          });

          if (!prep.ok) {
            return { ok: false, error: prep.error };
          }

          const customer = await tx.customer.create({
            data: {
              organizationId: ctx.organizationId,
              ...prep.data,
            },
          });
          resolvedCustomerId = customer.id;

          // Carry forward service location
          await attachIntakeServiceLocationToCustomerFromLead(tx, {
            organizationId: ctx.organizationId,
            customerId: customer.id,
            leadId: lead.id,
            leadChannel: lead.channel,
            snapshot: intakeSnapshotForCustomerFromLead(lead),
          });

          // Log event
          await tx.leadEvent.create({
            data: {
              leadId: lead.id,
              type: "CONVERTED_TO_CUSTOMER",
              payload: { customerId: customer.id } as Prisma.InputJsonValue,
              actorUserId: ctx.userId,
            },
          });
        }

        // 2. Create Draft Quote
        const quoteTitle = `Quote — ${contact.name || "Customer"}`;

        const quote = await tx.quote.create({
          data: {
            organizationId: ctx.organizationId,
            customerId: resolvedCustomerId,
            leadId: lead.id,
            status: QuoteStatus.DRAFT,
            title: quoteTitle,
            subtotalCents: 0,
            totalCents: 0,
          },
        });

        // 3. Mark lead as CONVERTED (always graduate on quote creation)
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            customerId: resolvedCustomerId,
            status: "CONVERTED",
            convertedAt: new Date(),
          },
        });

        // 4. Apply Suggested Templates
        const suggestedTemplateIds = signals?.suggestedTemplateIds || [];
        if (suggestedTemplateIds.length > 0) {
          for (const tid of suggestedTemplateIds) {
            await performApplyLineItemTemplateToQuoteTx(tx, quote.id, tid, ctx.organizationId);
          }
        }

        // 4. Carry Forward Service Location to Quote Notes
        if (resolvedCustomerId) {
          const primaryLoc = await tx.customerServiceLocation.findFirst({
            where: {
              organizationId: ctx.organizationId,
              customerId: resolvedCustomerId,
              isPrimary: true,
            },
            select: { formattedAddress: true, addressLine1: true },
          });
          const line = formatPrimaryServiceLocationLineForQuoteNotes(primaryLoc);
          if (line) {
            const prefix = `Primary service location:\n${line}\n\n`;
            await tx.quote.update({
              where: { id: quote.id },
              data: { internalNotes: prefix },
            });
          }
        }

        // Log event
        await tx.leadEvent.create({
          data: {
            leadId: lead.id,
            type: "QUOTE_CREATED",
            payload: { quoteId: quote.id } as Prisma.InputJsonValue,
            actorUserId: ctx.userId,
          },
        });

        return { ok: true, quoteId: quote.id, reusedExisting: false };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return {
        ok: false,
        error: "Another change happened at the same moment. Refresh the workspace and try again.",
      };
    }
    throw e;
  }
}

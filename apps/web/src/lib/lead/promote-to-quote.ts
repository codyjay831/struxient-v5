import { db } from "../db";
import { LeadStatus, Prisma, QuoteStatus } from "@prisma/client";
import { getCommercialRequestContextOrThrow } from "../auth-context";
import { evaluateLeadReadiness } from "../lead-readiness-heuristics";
import {
  hasIssuedQuoteWithoutDraft,
  pickMostRecentDraftQuote,
  type OpportunityFlowQuoteInput,
} from "../opportunity-flow";
import { prepareCustomerFromLead } from "../lead-create-customer";
import {
  attachIntakeServiceLocationToCustomerFromLead,
  ensureServiceLocationForLeadFromSnapshot,
  intakeSnapshotForCustomerFromLead,
} from "../customer-service-location-from-lead";
import { readContact, readRequest, readSignals } from "./lead-projection";
import { jobsiteLineFromLead, isLeadAddressQuoteReady } from "../jobsite-address";
import {
  CUSTOMER_MATCH_BLOCK_MESSAGE,
  evaluateCustomerMatchGate,
  loadOrgCustomersForMatchGate,
  shouldBlockQuotePromotionForCustomerMatch,
} from "../lead-customer-match-gate";
import {
  performApplyLineItemTemplateToQuoteTx,
} from "../quote-line-item-template-apply-tx";

export interface PromoteLeadToQuoteResult {
  ok: boolean;
  quoteId?: string;
  reusedExisting?: boolean;
  error?: string;
}

import {
  ISSUED_QUOTE_REVISION_MESSAGE,
  leadStatusAfterQuoteWork,
} from "./lead-promotion-semantics";

async function syncLeadAfterQuoteWork(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  params: {
    leadId: string;
    currentStatus: LeadStatus;
    convertedAt: Date | null;
    customerId: string | null;
    serviceLocationId: string | null;
    resolvedCustomerId: string;
    resolvedServiceLocationId: string | null;
    actorUserId: string;
    linkedCustomerCreated: boolean;
  },
) {
  const nextStatus = leadStatusAfterQuoteWork(params.currentStatus);
  await tx.lead.update({
    where: { id: params.leadId },
    data: {
      customerId: params.resolvedCustomerId,
      serviceLocationId: params.resolvedServiceLocationId,
      status: nextStatus,
      convertedAt: params.convertedAt ?? new Date(),
    },
  });

  if (params.linkedCustomerCreated) {
    await tx.leadEvent.create({
      data: {
        leadId: params.leadId,
        type: "CONVERTED_TO_CUSTOMER",
        payload: { customerId: params.resolvedCustomerId } as Prisma.InputJsonValue,
        actorUserId: params.actorUserId,
      },
    });
  }
}

/**
 * Promotes a lead (Lead) to a Quote.
 * Handles customer creation if necessary, links the lead to the customer,
 * and creates a draft quote with suggested templates.
 */
export async function promoteLeadToQuote(leadId: string): Promise<PromoteLeadToQuoteResult> {
  const ctx = await getCommercialRequestContextOrThrow();
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
            serviceLocationId: true,
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
                createdAt: true,
                updatedAt: true,
                customerId: true,
                serviceLocationId: true,
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

        const quoteInputs: OpportunityFlowQuoteInput[] = lead.quotes.map((q) => ({
          id: q.id,
          title: q.title,
          status: q.status,
          totalCents: q.totalCents,
          lineItemCount: q._count.lineItems,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          job:
            q.job && q.job.organizationId === ctx.organizationId
              ? { id: q.job.id, status: q.job.status }
              : null,
        }));

        let customerPrimaryLocation: { googlePlaceId: string } | null = null;
        let resolvedServiceLocation: { googlePlaceId: string } | null = null;
        if (lead.customerId) {
          if (lead.serviceLocationId) {
            resolvedServiceLocation = await tx.customerServiceLocation.findFirst({
              where: {
                id: lead.serviceLocationId,
                customerId: lead.customerId,
                organizationId: ctx.organizationId,
              },
              select: { googlePlaceId: true },
            });
          }
          if (!resolvedServiceLocation) {
            customerPrimaryLocation = await tx.customerServiceLocation.findFirst({
              where: { customerId: lead.customerId, organizationId: ctx.organizationId },
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: { googlePlaceId: true },
            });
          }
        }

        const readiness = evaluateLeadReadiness({
          contactName: contact.name,
          companyName: contact.companyName,
          email: contact.email,
          phone: contact.phone,
          address: jobsiteLineFromLead(lead),
          isAddressVerified: isLeadAddressQuoteReady(lead, {
            resolvedServiceLocation,
            customerPrimaryLocation,
          }),
        });

        if (lead.status === "LOST" || lead.status === "ARCHIVED") {
          return {
            ok: false,
            error:
              "This lead is archived or closed. Open the full lead record if you need to change its status before starting a quote.",
          };
        }

        if (!readiness.isReady) {
          return {
            ok: false,
            error: "This lead is missing required contact or location info. Complete the intake before starting a quote.",
          };
        }

        if (!lead.customerId) {
          const orgCustomers = await loadOrgCustomersForMatchGate(ctx.organizationId);
          const matchHints = evaluateCustomerMatchGate({
            customerId: lead.customerId,
            email: contact.email,
            phone: contact.phone,
            orgCustomers,
          });
          if (shouldBlockQuotePromotionForCustomerMatch({ customerId: lead.customerId, hints: matchHints })) {
            return { ok: false, error: CUSTOMER_MATCH_BLOCK_MESSAGE };
          }
        }

        const reusableDraft = pickMostRecentDraftQuote(quoteInputs);
        if (reusableDraft) {
          const draftRow = lead.quotes.find((q) => q.id === reusableDraft.id);
          let resolvedCustomerId = lead.customerId ?? draftRow?.customerId ?? null;
          let resolvedServiceLocationId =
            lead.serviceLocationId ?? draftRow?.serviceLocationId ?? null;
          let linkedCustomerCreated = false;

          const intakeSnapshot = intakeSnapshotForCustomerFromLead(lead);
          if (!resolvedServiceLocationId) {
            resolvedServiceLocationId = await ensureServiceLocationForLeadFromSnapshot(tx, {
              organizationId: ctx.organizationId,
              leadId: lead.id,
              leadChannel: lead.channel,
              customerId: resolvedCustomerId,
              snapshot: intakeSnapshot,
            });
          }

          if (!resolvedCustomerId) {
            const prep = prepareCustomerFromLead({
              title: request.type || "Lead",
              contactName: contact.name,
              companyName: contact.companyName,
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
            linkedCustomerCreated = true;

            const attached = await attachIntakeServiceLocationToCustomerFromLead(tx, {
              organizationId: ctx.organizationId,
              customerId: customer.id,
              leadId: lead.id,
              leadChannel: lead.channel,
              snapshot: intakeSnapshot,
            });
            if (attached.locationId) {
              resolvedServiceLocationId = attached.locationId;
            }
          }

          if (resolvedCustomerId) {
            await tx.quote.update({
              where: { id: reusableDraft.id },
              data: {
                customerId: resolvedCustomerId,
                ...(resolvedServiceLocationId
                  ? { serviceLocationId: resolvedServiceLocationId }
                  : {}),
              },
            });
          }

          await syncLeadAfterQuoteWork(tx, {
            leadId: lead.id,
            currentStatus: lead.status,
            convertedAt: lead.convertedAt,
            customerId: lead.customerId,
            serviceLocationId: lead.serviceLocationId,
            resolvedCustomerId: resolvedCustomerId!,
            resolvedServiceLocationId,
            actorUserId: ctx.userId,
            linkedCustomerCreated,
          });

          return {
            ok: true,
            quoteId: reusableDraft.id,
            reusedExisting: true,
          };
        }

        if (hasIssuedQuoteWithoutDraft(quoteInputs)) {
          return { ok: false, error: ISSUED_QUOTE_REVISION_MESSAGE };
        }

        let resolvedCustomerId = lead.customerId;
        const intakeSnapshot = intakeSnapshotForCustomerFromLead(lead);
        let resolvedServiceLocationId = await ensureServiceLocationForLeadFromSnapshot(tx, {
          organizationId: ctx.organizationId,
          leadId: lead.id,
          leadChannel: lead.channel,
          customerId: resolvedCustomerId ?? null,
          snapshot: intakeSnapshot,
        });

        let linkedCustomerCreated = false;
        if (!resolvedCustomerId) {
          const prep = prepareCustomerFromLead({
            title: request.type || "Lead",
            contactName: contact.name,
            companyName: contact.companyName,
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
          linkedCustomerCreated = true;

          const attached = await attachIntakeServiceLocationToCustomerFromLead(tx, {
            organizationId: ctx.organizationId,
            customerId: customer.id,
            leadId: lead.id,
            leadChannel: lead.channel,
            snapshot: intakeSnapshot,
          });
          if (attached.locationId) {
            resolvedServiceLocationId = attached.locationId;
          }
        }

        const quoteTitle = `Quote — ${contact.companyName || contact.name || "Customer"}`;

        const quote = await tx.quote.create({
          data: {
            organizationId: ctx.organizationId,
            customerId: resolvedCustomerId,
            serviceLocationId: resolvedServiceLocationId,
            leadId: lead.id,
            status: QuoteStatus.DRAFT,
            title: quoteTitle,
            subtotalCents: 0,
            totalCents: 0,
          },
        });

        await syncLeadAfterQuoteWork(tx, {
          leadId: lead.id,
          currentStatus: lead.status,
          convertedAt: lead.convertedAt,
          customerId: lead.customerId,
          serviceLocationId: lead.serviceLocationId,
          resolvedCustomerId: resolvedCustomerId!,
          resolvedServiceLocationId,
          actorUserId: ctx.userId,
          linkedCustomerCreated,
        });

        const suggestedTemplateIds = signals?.suggestedTemplateIds || [];
        if (suggestedTemplateIds.length > 0) {
          for (const tid of suggestedTemplateIds) {
            await performApplyLineItemTemplateToQuoteTx(tx, quote.id, tid, ctx.organizationId);
          }
        }

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

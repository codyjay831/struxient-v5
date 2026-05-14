import { LeadChannel, NeededByBucket } from "@prisma/client";
import { LeadInput } from "../../schemas/lead-input";
import { LeadIntakeAdapter } from "./adapter";
import { PublicIntakeServiceLocationV1 } from "../../public-lead-service-location";

export interface WebFormPayload {
  contactName: string;
  email: string;
  phone: string;
  serviceAddress: string;
  preferredTiming: string;
  requestDetails: string;
  requestTypeLabel: string;
  publicIntakeServiceLocation: PublicIntakeServiceLocationV1 | null;
  neededByBucket: string;
  neededByDate: string;
  publicIntakeClientKey: string | null;
  attachmentIds: string[];
  requestedVisitDate?: string | null;
  requestedVisitWindow?: string | null;
  requestedVisitNotes?: string | null;
  lockInInstantQuote?: boolean;
  instantQuoteTemplateIds?: string[];
}

export class WebFormAdapter implements LeadIntakeAdapter<WebFormPayload> {
  channel = LeadChannel.WEB_FORM;

  parse(payload: WebFormPayload): LeadInput {
    return {
      title: `Public request — ${payload.contactName}`,
      contact: {
        name: payload.contactName,
        email: payload.email,
        phone: payload.phone,
      },
      request: {
        type: payload.requestTypeLabel,
        neededByBucket: (payload.neededByBucket as NeededByBucket) || undefined,
        neededByDate: payload.neededByDate ? new Date(payload.neededByDate) : undefined,
        scope: payload.requestDetails,
        lockInInstantQuote: payload.lockInInstantQuote,
        instantQuoteTemplateIds: payload.instantQuoteTemplateIds,
      },
      address: payload.publicIntakeServiceLocation ? {
        formattedAddress: payload.publicIntakeServiceLocation.formattedAddress,
        addressLine1: payload.publicIntakeServiceLocation.addressLine1,
        addressLine2: payload.publicIntakeServiceLocation.addressLine2,
        city: payload.publicIntakeServiceLocation.city,
        state: payload.publicIntakeServiceLocation.state,
        postalCode: payload.publicIntakeServiceLocation.postalCode,
        country: payload.publicIntakeServiceLocation.country,
        googlePlaceId: payload.publicIntakeServiceLocation.googlePlaceId,
        latitude: payload.publicIntakeServiceLocation.latitude ?? undefined,
        longitude: payload.publicIntakeServiceLocation.longitude ?? undefined,
      } : undefined,
      channel: this.channel,
      sourceDetail: "Public Intake Form",
      notes: this.buildPublicIntakeNotes(payload),
      publicClientKey: payload.publicIntakeClientKey || undefined,
      attachmentIds: payload.attachmentIds,
      visitRequest: (payload.requestedVisitDate || payload.requestedVisitWindow) ? {
        requestedDate: payload.requestedVisitDate ? new Date(payload.requestedVisitDate) : undefined,
        requestedWindow: payload.requestedVisitWindow || undefined,
        notes: payload.requestedVisitNotes || undefined,
      } : undefined,
    };
  }

  private buildPublicIntakeNotes(payload: WebFormPayload): string {
    return [
      "[Public Intake Form]",
      "",
      "Service / project location:",
      payload.serviceAddress,
      "",
      "Preferred timing:",
      payload.preferredTiming,
      "",
      "Request type:",
      payload.requestTypeLabel,
      "",
      "What you need help with:",
      payload.requestDetails,
    ].join("\n");
  }
}

import { LeadChannel, NeededByBucket } from "@prisma/client";
import { LeadInput } from "../../schemas/lead-input";
import { LeadIntakeAdapter } from "./adapter";
import { PublicIntakeServiceLocationV1 } from "../../public-lead-service-location";

export interface ManualPayload {
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  requestType: string | null;
  neededByBucket: string | null;
  neededByDate: string | null;
  scopeSummary: string | null;
  suggestedTemplateIds: string[];
  sourceDetail: string | null;
  notes: string | null;
  channel: LeadChannel;
  attachmentIds: string[];
  addressSnapshot: PublicIntakeServiceLocationV1 | null;
  requestedVisitDate?: string | null;
  requestedVisitWindow?: string | null;
  requestedVisitNotes?: string | null;
  customFields?: Record<string, string>;
}

export class ManualAdapter implements LeadIntakeAdapter<ManualPayload> {
  channel = LeadChannel.MANUAL; // Default, but can be overridden by payload

  parse(payload: ManualPayload): LeadInput {
    return {
      title: payload.title,
      contact: {
        name: payload.contactName,
        email: payload.email,
        phone: payload.phone,
      },
      request: {
        type: payload.requestType,
        neededByBucket: (payload.neededByBucket as NeededByBucket) || undefined,
        neededByDate: payload.neededByDate ? new Date(payload.neededByDate) : undefined,
        scope: payload.scopeSummary,
        suggestedTemplateIds: payload.suggestedTemplateIds,
      },
      address: payload.addressSnapshot ? {
        formattedAddress: payload.addressSnapshot.formattedAddress,
        addressLine1: payload.addressSnapshot.addressLine1,
        addressLine2: payload.addressSnapshot.addressLine2,
        city: payload.addressSnapshot.city,
        state: payload.addressSnapshot.state,
        postalCode: payload.addressSnapshot.postalCode,
        country: payload.addressSnapshot.country,
        googlePlaceId: payload.addressSnapshot.googlePlaceId,
        latitude: payload.addressSnapshot.latitude ?? undefined,
        longitude: payload.addressSnapshot.longitude ?? undefined,
      } : undefined,
      channel: payload.channel || this.channel,
      sourceDetail: payload.sourceDetail,
      notes: payload.notes,
      customFields: payload.customFields,
      attachmentIds: payload.attachmentIds,
      visitRequest: (payload.requestedVisitDate || payload.requestedVisitWindow) ? {
        requestedDate: payload.requestedVisitDate ? new Date(payload.requestedVisitDate) : undefined,
        requestedWindow: payload.requestedVisitWindow || undefined,
        notes: payload.requestedVisitNotes || undefined,
      } : undefined,
    };
  }
}

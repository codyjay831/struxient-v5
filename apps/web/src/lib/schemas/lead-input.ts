import { z } from "zod";
import { NeededByBucket, LeadChannel } from "@prisma/client";

export const LeadInputSchema = z.object({
  title: z.string().min(1).max(120),
  contact: z.object({
    name: z.string().min(1).max(120).nullable(),
    companyName: z.string().max(120).nullable().optional(),
    email: z.string().email().max(255).nullable().or(z.literal("")),
    phone: z.string().max(40).nullable().or(z.literal("")),
  }).refine(c => c.name || c.companyName || c.email || c.phone, "Need at least one contact detail"),
  request: z.object({
    type: z.string().max(80).nullable().optional(),
    neededByBucket: z.nativeEnum(NeededByBucket).nullable().optional(),
    neededByDate: z.date().nullable().optional(),
    scope: z.string().max(4000).nullable().optional(),
    suggestedTemplateIds: z.array(z.string()).optional(),
    lockInInstantQuote: z.boolean().optional(),
    instantQuoteTemplateIds: z.array(z.string()).optional(),
  }),
  address: z.object({
    formattedAddress: z.string(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    googlePlaceId: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).nullable().optional(),
  channel: z.nativeEnum(LeadChannel),
  sourceDetail: z.string().max(255).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  publicClientKey: z.string().uuid().nullable().optional(),
  customFields: z.record(z.string(), z.string()).optional(),
  attachmentIds: z.array(z.string()).optional(),
  visitRequest: z.object({
    requestedDate: z.date().nullable().optional(),
    requestedWindow: z.string().max(120).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  }).optional(),
});

export type LeadInput = z.infer<typeof LeadInputSchema>;

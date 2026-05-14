import { LeadChannel } from "@prisma/client";
import { LeadInput } from "../../schemas/lead-input";

export interface LeadIntakeAdapter<TPayload> {
  channel: LeadChannel;
  parse(payload: TPayload): LeadInput;
}

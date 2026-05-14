import { LeadChannel } from "@prisma/client";
import { LeadInput } from "../../schemas/lead-input";
import { LeadIntakeAdapter } from "./adapter";

export class EmailAdapter implements LeadIntakeAdapter<unknown> {
  channel = LeadChannel.EMAIL;
  parse(payload: unknown): LeadInput {
    void payload;
    throw new Error("EmailAdapter not implemented");
  }
}

export class SmsAdapter implements LeadIntakeAdapter<unknown> {
  channel = LeadChannel.SMS;
  parse(payload: unknown): LeadInput {
    void payload;
    throw new Error("SmsAdapter not implemented");
  }
}

export class WebhookAdapter implements LeadIntakeAdapter<unknown> {
  channel = LeadChannel.WEBHOOK;
  parse(payload: unknown): LeadInput {
    void payload;
    throw new Error("WebhookAdapter not implemented");
  }
}

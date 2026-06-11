import {
  BusinessProfileCustomerMarket,
  BusinessProfileOperatingModel,
  BusinessProfileTeamSize,
  BusinessProfileTrade,
  BusinessProfileWorkType,
} from "@prisma/client";
import { z } from "zod";
import {
  BUSINESS_PROFILE_CUSTOMER_MARKET_OPTIONS,
  BUSINESS_PROFILE_TRADE_OPTIONS,
  BUSINESS_PROFILE_WORK_TYPE_OPTIONS,
} from "./business-profile-options";

function dedupeValues<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

const MAX_TRADES = BUSINESS_PROFILE_TRADE_OPTIONS.length;
const MAX_WORK_TYPES = BUSINESS_PROFILE_WORK_TYPE_OPTIONS.length;
const MAX_CUSTOMER_MARKETS = BUSINESS_PROFILE_CUSTOMER_MARKET_OPTIONS.length;

export const BusinessProfileWriteSchema = z.object({
  trades: z.array(z.nativeEnum(BusinessProfileTrade)).default([]),
  workTypes: z.array(z.nativeEnum(BusinessProfileWorkType)).default([]),
  customerMarkets: z.array(z.nativeEnum(BusinessProfileCustomerMarket)).default([]),
  operatingModel: z.nativeEnum(BusinessProfileOperatingModel).nullable().default(null),
  teamSize: z.nativeEnum(BusinessProfileTeamSize).nullable().default(null),
});

export type BusinessProfileWriteValues = z.output<typeof BusinessProfileWriteSchema>;

export type NormalizedBusinessProfileValues = {
  trades: BusinessProfileTrade[];
  workTypes: BusinessProfileWorkType[];
  customerMarkets: BusinessProfileCustomerMarket[];
  operatingModel: BusinessProfileOperatingModel | null;
  teamSize: BusinessProfileTeamSize | null;
};

export function normalizeBusinessProfileValues(
  input: unknown,
): { ok: true; values: NormalizedBusinessProfileValues } | { ok: false; error: string } {
  const parsed = BusinessProfileWriteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid business profile values." };
  }

  const values: NormalizedBusinessProfileValues = {
    trades: dedupeValues(parsed.data.trades),
    workTypes: dedupeValues(parsed.data.workTypes),
    customerMarkets: dedupeValues(parsed.data.customerMarkets),
    operatingModel: parsed.data.operatingModel,
    teamSize: parsed.data.teamSize,
  };

  if (values.trades.length > MAX_TRADES) {
    return { ok: false, error: "Too many trades selected." };
  }
  if (values.workTypes.length > MAX_WORK_TYPES) {
    return { ok: false, error: "Too many work types selected." };
  }
  if (values.customerMarkets.length > MAX_CUSTOMER_MARKETS) {
    return { ok: false, error: "Too many customer markets selected." };
  }

  return { ok: true, values };
}

export function hasAnyBusinessProfileAnswer(values: NormalizedBusinessProfileValues): boolean {
  return (
    values.trades.length > 0 ||
    values.workTypes.length > 0 ||
    values.customerMarkets.length > 0 ||
    values.operatingModel !== null ||
    values.teamSize !== null
  );
}


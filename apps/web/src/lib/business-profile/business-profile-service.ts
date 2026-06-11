import type {
  BusinessProfileCustomerMarket,
  BusinessProfileOperatingModel,
  BusinessProfileTeamSize,
  BusinessProfileTrade,
  BusinessProfileWorkType,
} from "@prisma/client";
import type { RequestContext } from "@/lib/auth-context";
import { db } from "@/lib/db";
import {
  assertCanManageBusinessProfile,
  assertCanViewBusinessProfile,
  canManageBusinessProfile,
  canViewBusinessProfile,
} from "./business-profile-permissions";
import {
  hasAnyBusinessProfileAnswer,
  normalizeBusinessProfileValues,
} from "./business-profile-schema";

export type BusinessProfileSnapshot = {
  trades: BusinessProfileTrade[];
  workTypes: BusinessProfileWorkType[];
  customerMarkets: BusinessProfileCustomerMarket[];
  operatingModel: BusinessProfileOperatingModel | null;
  teamSize: BusinessProfileTeamSize | null;
  createdAt: Date;
  updatedAt: Date;
  updatedByUserId: string | null;
};

export type BusinessProfileViewResult = {
  organizationName: string;
  profile: BusinessProfileSnapshot | null;
  canView: boolean;
  canManage: boolean;
};

export async function getBusinessProfileViewForOrganization(
  ctx: RequestContext,
): Promise<BusinessProfileViewResult> {
  assertCanViewBusinessProfile(ctx.role);

  const organization = await db.organization.findUnique({
    where: { id: ctx.organizationId },
    select: {
      name: true,
      businessProfile: {
        select: {
          trades: true,
          workTypes: true,
          customerMarkets: true,
          operatingModel: true,
          teamSize: true,
          createdAt: true,
          updatedAt: true,
          updatedByUserId: true,
        },
      },
    },
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  return {
    organizationName: organization.name,
    profile: organization.businessProfile,
    canView: canViewBusinessProfile(ctx.role),
    canManage: canManageBusinessProfile(ctx.role),
  };
}

export async function getBusinessProfileForAi(organizationId: string): Promise<BusinessProfileSnapshot | null> {
  const profile = await db.organizationBusinessProfile.findUnique({
    where: { organizationId },
    select: {
      trades: true,
      workTypes: true,
      customerMarkets: true,
      operatingModel: true,
      teamSize: true,
      createdAt: true,
      updatedAt: true,
      updatedByUserId: true,
    },
  });
  return profile;
}

export async function saveBusinessProfile(
  ctx: RequestContext,
  input: unknown,
): Promise<
  | { ok: true; saved: false; profile: null }
  | { ok: true; saved: true; profile: BusinessProfileSnapshot }
  | { ok: false; error: string }
> {
  assertCanManageBusinessProfile(ctx.role);

  const normalized = normalizeBusinessProfileValues(input);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const values = normalized.values;
  const hasAnyAnswer = hasAnyBusinessProfileAnswer(values);
  const existing = await db.organizationBusinessProfile.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { id: true },
  });

  if (!hasAnyAnswer && !existing) {
    return { ok: true, saved: false, profile: null };
  }

  const profile = await db.organizationBusinessProfile.upsert({
    where: { organizationId: ctx.organizationId },
    create: {
      organizationId: ctx.organizationId,
      trades: values.trades,
      workTypes: values.workTypes,
      customerMarkets: values.customerMarkets,
      operatingModel: values.operatingModel,
      teamSize: values.teamSize,
      updatedByUserId: ctx.userId,
    },
    update: {
      trades: values.trades,
      workTypes: values.workTypes,
      customerMarkets: values.customerMarkets,
      operatingModel: values.operatingModel,
      teamSize: values.teamSize,
      updatedByUserId: ctx.userId,
    },
    select: {
      trades: true,
      workTypes: true,
      customerMarkets: true,
      operatingModel: true,
      teamSize: true,
      createdAt: true,
      updatedAt: true,
      updatedByUserId: true,
    },
  });

  return { ok: true, saved: true, profile };
}


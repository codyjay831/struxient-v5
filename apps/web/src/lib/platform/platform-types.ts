import type { PlatformAuditOutcome, PlatformRole } from "@prisma/client";

export type PlatformContext = {
  userId: string;
  userEmail: string | null;
  platformAccessId: string;
  role: PlatformRole;
  authSource: "session";
  requestId: string;
};

export type PlatformPageQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
};

export type PlatformPageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type PlatformAuditFilters = PlatformPageQuery & {
  actorUserId?: string;
  organizationId?: string;
  action?: string;
  outcome?: PlatformAuditOutcome;
};

export type PlatformOrganizationListItem = {
  id: string;
  name: string;
  slug: string | null;
  createdAt: Date;
  memberCount: number;
  jobCount: number;
  ownerNames: string[];
};

export type PlatformUserListItem = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  emailVerified: boolean;
  lastActiveOrganizationName: string | null;
  memberships: Array<{ organizationId: string; organizationName: string; role: string }>;
};

export type PlatformDashboardSummary = {
  organizationCount: number;
  userCount: number;
  recentOrganizations: Array<{ id: string; name: string; createdAt: Date }>;
  recentAuditEvents: PlatformAuditEventDto[];
  recentAiFailureCount: number;
  recentNotificationFailureCount: number;
};

export type PlatformAuditEventDto = {
  id: string;
  createdAt: Date;
  actorType: string;
  actorUserId: string | null;
  actorEmailSnapshot: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  organizationId: string | null;
  reason: string | null;
  outcome: PlatformAuditOutcome;
  requestId: string | null;
  metadataJson: Record<string, unknown> | null;
};

export type PlatformOrganizationSummary = {
  id: string;
  name: string;
  slug: string | null;
  timezone: string;
  createdAt: Date;
  businessProfile: {
    trades: string[];
    teamSize: string | null;
  } | null;
  memberships: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    role: string;
    createdAt: Date;
  }>;
  pendingInvites: Array<{
    id: string;
    email: string;
    role: string;
    expiresAt: Date;
  }>;
  jobCountsByStatus: Record<string, number>;
  quoteCountsByStatus: Record<string, number>;
  leadCountsByStatus: Record<string, number>;
  taskCountsByStatus: Record<string, number>;
  recentAiFailures: PlatformAiFailureDto[];
  aiCountsByFeature: Array<{ feature: string; status: string; count: number }>;
  recentNotificationFailures: PlatformNotificationFailureDto[];
  recentPlatformAuditEvents: PlatformAuditEventDto[];
  subscription: PlatformOrganizationSubscriptionDto | null;
  aiBillingPeriod: PlatformAiBillingPeriodDto | null;
};

export type PlatformOrganizationSubscriptionDto = {
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

export type PlatformAiBillingPeriodDto = {
  includedAllowanceUnits: number;
  usedUnits: number;
  overageUnits: number;
  overageAmountCents: number;
  invoiceStatus: string;
};

export type PlatformAiFailureDto = {
  id: string;
  feature: string;
  provider: string;
  model: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
};

export type PlatformNotificationFailureDto = {
  id: string;
  kind: string;
  title: string;
  errorMessage: string | null;
  createdAt: Date;
};

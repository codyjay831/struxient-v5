import {
  CustomerPortalAccessLevel,
  CustomerPortalAccessStatus,
  CustomerVisibleResourceType,
  StaffRole,
} from "@prisma/client";
import { db } from "@/lib/db";
import { canReadCommercial } from "@/lib/authz/capabilities";
import {
  getCustomerPortalSessionTokenFromCookie,
  resolveCustomerPortalSession,
  type CustomerPortalSessionContext,
} from "./session-service";
import { authorizeVisibleResource } from "./visible-resource-service";

export type CustomerPortalAuthContext = CustomerPortalSessionContext & {
  accessLevel: CustomerPortalAccessLevel;
};

export class CustomerPortalAccessDeniedError extends Error {
  constructor(message = "Customer portal access denied.") {
    super(message);
    this.name = "CustomerPortalAccessDeniedError";
  }
}

async function loadAccessRecord(accessId: string) {
  return db.customerPortalAccess.findUnique({
    where: { id: accessId },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      jobId: true,
      status: true,
      accessLevel: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
}

function assertAccessRecordActive(
  access: NonNullable<Awaited<ReturnType<typeof loadAccessRecord>>>,
): void {
  const now = new Date();
  if (access.status !== CustomerPortalAccessStatus.ACTIVE || access.revokedAt) {
    throw new CustomerPortalAccessDeniedError();
  }
  if (access.expiresAt && access.expiresAt < now) {
    throw new CustomerPortalAccessDeniedError("Customer portal access has expired.");
  }
}

export async function requireCustomerPortalAccess(input?: {
  sessionToken?: string | null;
  accessId?: string;
  jobId?: string;
  resource?: {
    resourceType: CustomerVisibleResourceType;
    resourceId: string;
  };
}): Promise<CustomerPortalAuthContext> {
  const token = input?.sessionToken ?? (await getCustomerPortalSessionTokenFromCookie());
  if (!token) {
    throw new CustomerPortalAccessDeniedError("Customer portal session required.");
  }

  const session = await resolveCustomerPortalSession(token);
  if (!session) {
    throw new CustomerPortalAccessDeniedError("Customer portal session is invalid or expired.");
  }

  if (input?.accessId && session.customerPortalAccessId !== input.accessId) {
    throw new CustomerPortalAccessDeniedError();
  }
  if (input?.jobId && session.jobId !== input.jobId) {
    throw new CustomerPortalAccessDeniedError();
  }

  const access = await loadAccessRecord(session.customerPortalAccessId);
  if (!access) {
    throw new CustomerPortalAccessDeniedError();
  }
  assertAccessRecordActive(access);

  if (
    access.organizationId !== session.organizationId ||
    access.customerId !== session.customerId ||
    access.jobId !== session.jobId
  ) {
    throw new CustomerPortalAccessDeniedError();
  }

  if (input?.resource) {
    const visible = await authorizeVisibleResource({
      organizationId: session.organizationId,
      customerId: session.customerId,
      jobId: session.jobId,
      resourceType: input.resource.resourceType,
      resourceId: input.resource.resourceId,
      viewerAccessLevel: access.accessLevel,
    });
    if (!visible) {
      throw new CustomerPortalAccessDeniedError("Resource is not visible.");
    }
  }

  return {
    ...session,
    accessLevel: access.accessLevel,
  };
}

export function canManageCustomerPortal(role: StaffRole): boolean {
  return (
    role === StaffRole.OWNER || role === StaffRole.ADMIN || role === StaffRole.OFFICE
  );
}

/** Office and viewer commercial-read roles may see portal access metadata and coordination UI. */
export function canReadCustomerCoordination(role: StaffRole): boolean {
  return canReadCommercial(role);
}

import { Prisma, PrismaClient, StaffRole } from "@prisma/client";
import { hashSync } from "bcryptjs";
import {
  DEFAULT_INTAKE_FORM_DEFINITION,
  type IntakeFormDefinitionShape,
} from "@/lib/intake/default-intake-form";
import { ensureDefaultPublicIntakeFormDefinition } from "@/lib/intake/ensure-default-public-intake-form";
import {
  INTAKE_FORM_DEFINITION_SELECT,
  PUBLIC_INTAKE_FORM_WHERE,
  toIntakeFormDefinitionShape,
} from "@/lib/intake/intake-form-surface";
import { resolvePublicFormRequestTypeOptions } from "@/lib/intake/public-intake-request-types";
import type { PublicRequestTypeOption } from "@/lib/public-request-settings-defaults";
import {
  DEV_ORGANIZATION_ID,
  DEV_ORGANIZATION_NAME,
  DEV_ORGANIZATION_SLUG,
  DEV_USER_ID,
} from "./dev-organization";
import {
  effectivePublicRequestSettingsFromRow,
  type EffectivePublicRequestSettings,
} from "@/lib/public-request-settings-effective";
import {
  deriveLeadTitle,
  readContact,
  readRequest,
  readSignals,
} from "./lead/lead-projection";

const DEV_USER_EMAIL = "owner@dev.local";
const DEV_USER_NAME = "Dev Owner";
const DEV_USER_PASSWORD_HASH = hashSync("devpassword123", 10);

/**
 * Prisma client extension that exposes virtual fields on `Lead` mapped from the
 * JSONB columns. Lets readers continue to use `lead.title`, `lead.email`, etc.
 * while the database stores `contact`, `request`, `signals`, `address` as JSONB.
 *
 * Each computed field declares its `needs:` so Prisma fetches the underlying
 * JSONB column when the virtual field is selected.
 */
function buildExtendedClient(client: PrismaClient) {
  return client.$extends({
    name: "lead-projection",
    result: {
      lead: {
        title: {
          needs: { contact: true, request: true },
          compute(lead) {
            return deriveLeadTitle(lead.contact, lead.request);
          },
        },
        contactName: {
          needs: { contact: true },
          compute(lead) {
            return readContact(lead.contact).name;
          },
        },
        companyName: {
          needs: { contact: true },
          compute(lead) {
            return readContact(lead.contact).companyName;
          },
        },
        email: {
          needs: { contact: true },
          compute(lead) {
            return readContact(lead.contact).email;
          },
        },
        phone: {
          needs: { contact: true },
          compute(lead) {
            return readContact(lead.contact).phone;
          },
        },
        notes: {
          needs: { signals: true },
          compute(lead) {
            const s = readSignals(lead.signals);
            return typeof s.notes === "string" ? s.notes : null;
          },
        },
        sourceDetail: {
          needs: { signals: true },
          compute(lead) {
            const s = readSignals(lead.signals);
            return typeof s.sourceDetail === "string" ? s.sourceDetail : null;
          },
        },
        source: {
          needs: { channel: true },
          compute(lead) {
            return lead.channel;
          },
        },
        requestType: {
          needs: { request: true },
          compute(lead) {
            return readRequest(lead.request).type;
          },
        },
        neededByBucket: {
          needs: { request: true },
          compute(lead) {
            return readRequest(lead.request).neededByBucket;
          },
        },
        neededByDate: {
          needs: { request: true },
          compute(lead) {
            const r = readRequest(lead.request);
            if (r.neededByDate instanceof Date) return r.neededByDate;
            if (typeof r.neededByDate === "string") {
              const d = new Date(r.neededByDate);
              return Number.isNaN(d.getTime()) ? null : d;
            }
            return null;
          },
        },
        scopeSummary: {
          needs: { request: true },
          compute(lead) {
            return readRequest(lead.request).scope;
          },
        },
        publicIntakeServiceLocation: {
          needs: { address: true },
          compute(lead) {
            return lead.address as Prisma.JsonValue | null;
          },
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<typeof buildExtendedClient>;

/**
 * Transaction client type for the extended Prisma client. Use this for any
 * helper that accepts `tx` from `db.$transaction(async (tx) => { ... })`.
 *
 * The Prisma client extension changes the inferred shape of `tx`, so the
 * built-in `Prisma.TransactionClient` no longer matches. Use this alias
 * instead.
 */
export type ExtendedTransactionClient = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

function jobTaskDmmfFieldNames(): string[] {
  const jobTaskModel = Prisma.dmmf.datamodel.models.find((m) => m.name === "JobTask");
  return jobTaskModel?.fields.map((f) => f.name) ?? [];
}

function agentDebugLog(payload: Record<string, unknown>) {
  const entry = { sessionId: "1c71ed", timestamp: Date.now(), ...payload };
  // #region agent log
  fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1c71ed" },
    body: JSON.stringify(entry),
  }).catch(() => {});
  // #endregion
}

const prismaClientSingleton = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/web/.env.example to apps/web/.env and set DATABASE_URL for your environment."
    );
  }
  const fieldNames = jobTaskDmmfFieldNames();
  agentDebugLog({
    runId: "post-fix",
    hypothesisId: "H1-H2",
    location: "db.ts:prismaClientSingleton",
    message: "Creating new PrismaClient singleton",
    data: {
      hasDueAt: fieldNames.includes("dueAt"),
      hasScheduledStartAt: fieldNames.includes("scheduledStartAt"),
      jobTaskFieldCount: fieldNames.length,
    },
  });
  return buildExtendedClient(new PrismaClient());
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

function getPrisma(): ExtendedPrismaClient {
  const reused = Boolean(globalThis.prisma);
  if (!globalThis.prisma) {
    globalThis.prisma = prismaClientSingleton();
  }
  const fieldNames = jobTaskDmmfFieldNames();
  agentDebugLog({
    runId: "post-fix",
    hypothesisId: "H1",
    location: "db.ts:getPrisma",
    message: reused ? "Reusing cached globalThis.prisma" : "Initialized globalThis.prisma",
    data: {
      reusedSingleton: reused,
      hasDueAt: fieldNames.includes("dueAt"),
      hasScheduledStartAt: fieldNames.includes("scheduledStartAt"),
    },
  });
  return globalThis.prisma;
}

/**
 * Lazily instantiates Prisma so `next build` can load route modules without DATABASE_URL.
 * The first real query still requires DATABASE_URL and fails with the error above if unset.
 */
export const db: ExtendedPrismaClient = new Proxy({} as ExtendedPrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop) as unknown;
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});

/**
 * @deprecated Use getRequestContextOrThrow() from @/lib/auth-context instead.
 * Temporary development-only tenant selection until auth and org context exist.
 * Uses a fixed development organization id aligned with prisma/seed.ts — not RBAC.
 */
export async function getDevOrganizationOrThrow() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("getDevOrganizationOrThrow is not allowed in production.");
  }

  const existing = await db.organization.findUnique({
    where: { id: DEV_ORGANIZATION_ID },
  });
  if (existing) {
    if (!existing.slug) {
      await db.organization.update({
        where: { id: DEV_ORGANIZATION_ID },
        data: { slug: DEV_ORGANIZATION_SLUG },
      });
      return db.organization.findUniqueOrThrow({
        where: { id: DEV_ORGANIZATION_ID },
      });
    }
    return existing;
  }
  return db.organization.create({
    data: {
      id: DEV_ORGANIZATION_ID,
      name: DEV_ORGANIZATION_NAME,
      slug: DEV_ORGANIZATION_SLUG,
    },
  });
}

/**
 * Development-only helper to ensure a dev user and membership exist.
 * Gated by NODE_ENV !== "production".
 */
export async function ensureDevUserAndMembership() {
  if (process.env.NODE_ENV === "production") return;

  const org = await getDevOrganizationOrThrow();

  const devUser = await db.user.upsert({
    where: { id: DEV_USER_ID },
    update: {
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
      passwordHash: DEV_USER_PASSWORD_HASH,
    },
    create: {
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
      passwordHash: DEV_USER_PASSWORD_HASH,
    },
  });

  await db.membership.upsert({
    where: {
      userId_organizationId: {
        userId: devUser.id,
        organizationId: org.id,
      },
    },
    update: { role: StaffRole.OWNER },
    create: {
      userId: devUser.id,
      organizationId: org.id,
      role: StaffRole.OWNER,
    },
  });
}

export type PublicRequestIntakeBundle = {
  organizationId: string;
  organizationDisplayName: string;
  companySlug: string;
  intake: EffectivePublicRequestSettings;
  /**
   * Active published WEB_FORM IntakeFormDefinition (channel=WEB_FORM, isPublic, isDefault,
   * archivedAt=null) when one exists. Falls back to `DEFAULT_INTAKE_FORM_DEFINITION` for
   * organizations that have not customized their public request form.
   */
  formDefinition: IntakeFormDefinitionShape;
  /** Resolved from form `triageRules`, with legacy settings/default fallback. */
  requestTypeOptions: PublicRequestTypeOption[];
};

/**
 * Public `/request/[companySlug]` or `/request/[companySlug]/[formSlug]` payload.
 * Returns null when no organization matches the slug or the form is not found/public.
 */
export async function getPublicRequestIntakeBundle(
  companySlug: string,
  formSlug?: string,
): Promise<PublicRequestIntakeBundle | null> {
  const normalizedCompany = companySlug.trim().toLowerCase();
  if (!normalizedCompany) {
    return null;
  }

  const org = await db.organization.findFirst({
    where: { slug: normalizedCompany },
    select: {
      id: true,
      name: true,
      slug: true,
      publicRequestSettings: {
        select: {
          enabled: true,
          formTitle: true,
          introMessage: true,
          emergencyWarningText: true,
          submitButtonText: true,
          requestTypeOptionsJson: true,
          instantQuoteConfigJson: true,
          instantQuoteEnabled: true,
          showInstantQuoteDetails: true,
          offerings: true,
        },
      },
    },
  });

  if (!org?.slug) {
    return null;
  }

  const intake = effectivePublicRequestSettingsFromRow(org.publicRequestSettings);

  // When formSlug is provided, load that specific form.
  // When omitted, load the org's default public WEB_FORM form.
  const formWhere: Prisma.IntakeFormDefinitionWhereInput = {
    organizationId: org.id,
    ...PUBLIC_INTAKE_FORM_WHERE,
    archivedAt: null,
  };

  if (formSlug) {
    formWhere.slug = formSlug.trim().toLowerCase();
  } else {
    formWhere.isDefault = true;
  }

  const published = await db.intakeFormDefinition.findFirst({
    where: formWhere,
    select: { ...INTAKE_FORM_DEFINITION_SELECT, triageRules: true },
    orderBy: { updatedAt: "desc" },
  });

  let formDefinition: IntakeFormDefinitionShape;
  const shaped = published ? toIntakeFormDefinitionShape(published) : null;
  if (shaped) {
    formDefinition = shaped;
  } else {
    if (formSlug) {
      return null;
    }
    // Default route: provision a real IntakeFormDefinition so submit/provenance stay consistent.
    try {
      formDefinition = await ensureDefaultPublicIntakeFormDefinition(org.id);
    } catch (error) {
      console.error(
        "[getPublicRequestIntakeBundle] ensureDefaultPublicIntakeFormDefinition failed; using synthetic fallback",
        { organizationId: org.id, companySlug: normalizedCompany, error },
      );
      formDefinition = DEFAULT_INTAKE_FORM_DEFINITION;
    }
  }

  const requestTypeOptions = resolvePublicFormRequestTypeOptions(
    published?.triageRules,
    org.publicRequestSettings?.requestTypeOptionsJson,
  );

  return {
    organizationId: org.id,
    organizationDisplayName: org.name,
    companySlug: org.slug,
    intake,
    formDefinition,
    requestTypeOptions,
  };
}

/**
 * Legacy wrapper for `/request/[slug]`.
 */
export async function getPublicRequestIntakeBundleBySlug(
  slug: string,
): Promise<PublicRequestIntakeBundle | null> {
  return getPublicRequestIntakeBundle(slug);
}

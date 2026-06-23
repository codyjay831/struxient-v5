import { JobTaskStatus, StaffRole } from "@prisma/client";
import { db } from "@/lib/db";
import { getJobVisibilityWhere, getTaskVisibilityWhere, getVisitExecutionAssignmentWhere } from "@/lib/authz/resource-access";
import { hasCapability } from "@/lib/authz/capabilities";

export const STAFF_ACTIONS = {
  TASK_CREATE: "task.create",
  TASK_COMPLETE: "task.complete",
  TASK_COMPLETION_NOTE_SAVE: "task.completion_note.save",
  TASK_STATUS_UPDATE: "task.status.update",
  TASK_READINESS_OVERRIDE: "task.readiness.override",
  TASK_CHECKLIST_TOGGLE: "task.checklist.toggle",
  TASK_PROOF_UPLOAD_PREPARE: "task.proof_upload.prepare",
  TASK_PROOF_UPLOAD_COMPLETE: "task.proof_upload.complete",
  TASK_SCHEDULE_UPDATE: "task.schedule.update",
  TASK_DEADLINE_UPDATE: "task.deadline.update",
  ISSUE_CREATE: "issue.create",
  ISSUE_RESOLVE: "issue.resolve",
  ISSUE_FORCE_RESOLVE: "issue.force_resolve",
  DAILY_LOG_DRAFT_UPSERT: "daily_log.draft.upsert",
  DAILY_LOG_REVIEW: "daily_log.review",
  DAILY_LOG_VOID: "daily_log.void",
  RECOVERY_REQUEST: "recovery.request",
  RECOVERY_MANAGE: "recovery.manage",
  RECOVERY_RESUME: "recovery.resume",
  RECOVERY_SUGGEST: "recovery.suggest",
  VISIT_SCHEDULE_CREATE: "visit.schedule.create",
  VISIT_SCHEDULE_UPDATE: "visit.schedule.update",
  VISIT_CANCEL: "visit.cancel",
  VISIT_COMPLETE: "visit.complete",
  SCHEDULE_EVENT_CREATE: "schedule.event.create",
  SCHEDULE_EVENT_CONFIRM: "schedule.event.confirm",
  SCHEDULE_EVENT_CANCEL: "schedule.event.cancel",
  SCHEDULE_EVENT_UPDATE: "schedule.event.update",
  SCHEDULE_EVENT_COMPLETE: "schedule.event.complete",
  SCHEDULE_EVENT_LINK_TASKS: "schedule.event.link_tasks",
  SCHEDULE_EVENT_UNLINK_TASKS: "schedule.event.unlink_tasks",
  SCHEDULE_BLOCK_UPSERT: "schedule.block.upsert",
  LEAD_VISIT_SCHEDULE_CONFIRM: "lead_visit.schedule.confirm",
  LEAD_VISIT_SCHEDULE_CANCEL: "lead_visit.schedule.cancel",
  LEAD_VISIT_SCHEDULE_RESCHEDULE: "lead_visit.schedule.reschedule",
  LEAD_VISIT_COMPLETE: "lead_visit.complete",
  LEAD_VISIT_NO_SHOW: "lead_visit.no_show",
  LEAD_VISIT_OUTCOME_UPDATE: "lead_visit.outcome.update",
  LEAD_VISIT_ACCESS_DETAILS_UPDATE: "lead_visit.access_details.update",
  JOB_ARCHIVE: "job.archive",
  JOB_SCHEDULE_CLEANUP_CONFIRM: "job.schedule_cleanup.confirm",
  WORK_PACKAGE_CREATE: "work_package.create",
  WORK_PACKAGE_TASK_ASSIGN: "work_package.task.assign",
  JOB_FIELD_HOLD_CREATE: "job.field_hold.create",
  JOB_FIELD_HOLD_CANCEL: "job.field_hold.cancel",
  JOB_PAYMENT_REQUIREMENT_CREATE: "job.payment_requirement.create",
  JOB_PAYMENT_REQUIREMENT_MARK_PAID: "job.payment_requirement.mark_paid",
  JOB_PAYMENT_REQUIREMENT_WAIVE: "job.payment_requirement.waive",
  JOB_PAYMENT_REQUIREMENT_CANCEL: "job.payment_requirement.cancel",
  JOB_PAYMENT_REQUIREMENT_PORTAL_LINK_UPDATE: "job.payment_requirement.portal_link.update",
} as const;

export type StaffAction = (typeof STAFF_ACTIONS)[keyof typeof STAFF_ACTIONS];

export const AUTHZ_DENY_CODES = {
  ROLE_DENIED: "ROLE_DENIED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  NOT_ASSIGNED: "NOT_ASSIGNED",
  COLLABORATOR_GRANT_REQUIRED: "COLLABORATOR_GRANT_REQUIRED",
  COLLABORATOR_PERMISSION_DENIED: "COLLABORATOR_PERMISSION_DENIED",
  TASK_ALREADY_DONE: "TASK_ALREADY_DONE",
  TASK_CANCELED: "TASK_CANCELED",
  INTERNAL_CONTENT_DENIED: "INTERNAL_CONTENT_DENIED",
  UNSUPPORTED_RESOURCE: "UNSUPPORTED_RESOURCE",
  UNSUPPORTED_ACTION: "UNSUPPORTED_ACTION",
} as const;

export type AuthzDenyCode = (typeof AUTHZ_DENY_CODES)[keyof typeof AUTHZ_DENY_CODES];

export type AuthorizeResult =
  | { ok: true; scope: "org" | "assignment" | "collaborator"; message?: undefined }
  | { ok: false; code: AuthzDenyCode; message: string };

export type StaffActor = {
  organizationId: string;
  userId: string;
  role: StaffRole;
};

type CollaboratorGrant = {
  permissionsJson: unknown;
};

export type LoadedTaskAuthorizationResource = {
  id: string;
  status: JobTaskStatus;
  assignedUserId: string | null;
  assigneeRole?: StaffRole | null;
  relationshipScope?: "org" | "assignment" | "collaborator";
  collaboratorGrants?: CollaboratorGrant[];
};

export type LoadedJobStageAuthorizationResource = {
  id: string;
  relationshipScope?: "org" | "assignment";
};

export type LoadedJobAuthorizationResource = {
  id: string;
  relationshipScope?: "org" | "assignment" | "collaborator";
  collaboratorGrants?: CollaboratorGrant[];
  hasAssignedWork?: boolean;
};

export type LoadedJobIssueAuthorizationResource = {
  id: string;
  assigneeRole?: StaffRole | null;
  relationshipScope?: "org" | "assignment" | "collaborator";
  collaboratorGrants?: CollaboratorGrant[];
  hasAssignedWork?: boolean;
};

export type LoadedDailyJobLogAuthorizationResource = {
  id: string;
};

export type LoadedJobVisitAuthorizationResource = {
  id: string;
  assignedUserId?: string | null;
  assigneeRole?: StaffRole | null;
  relationshipScope?: "org" | "assignment" | "collaborator";
  collaboratorGrants?: CollaboratorGrant[];
};

export type LoadedJobScheduleEventAuthorizationResource = {
  id: string;
  leadUserId?: string | null;
  assigneeRole?: StaffRole | null;
  relationshipScope?: "org" | "assignment" | "collaborator";
  collaboratorGrants?: CollaboratorGrant[];
};

export type LoadedScheduleBlockAuthorizationResource = {
  id: string;
};

export type LoadedLeadVisitRequestAuthorizationResource = {
  id: string;
  assignedUserId?: string | null;
  assigneeRole?: StaffRole | null;
  relationshipScope?: "org" | "assignment";
};

export type LoadedJobPaymentRequirementAuthorizationResource = {
  id: string;
};

export type AuthorizeStaffActionInput = {
  action: StaffAction;
  resourceType:
    | "jobTask"
    | "jobStage"
    | "job"
    | "jobIssue"
    | "jobRecoveryFlow"
    | "jobVisit"
    | "jobScheduleEvent"
    | "scheduleBlock"
    | "leadVisitRequest"
    | "dailyJobLog"
    | "jobPaymentRequirement";
  resourceId: string;
  metadata?: {
    targetStatus?: JobTaskStatus;
    includesInternalNotes?: boolean;
    scheduledStartAt?: Date | null;
    scheduledEndAt?: Date | null;
    dueAt?: Date | null;
    externalWindowStartAt?: Date | null;
    externalWindowEndAt?: Date | null;
  } & Record<string, unknown>;
};

const MUTATE_TASK_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.TASK_COMPLETE,
  STAFF_ACTIONS.TASK_COMPLETION_NOTE_SAVE,
  STAFF_ACTIONS.TASK_STATUS_UPDATE,
  STAFF_ACTIONS.TASK_READINESS_OVERRIDE,
  STAFF_ACTIONS.TASK_CHECKLIST_TOGGLE,
  STAFF_ACTIONS.TASK_PROOF_UPLOAD_PREPARE,
  STAFF_ACTIONS.TASK_PROOF_UPLOAD_COMPLETE,
]);

const TASK_BOUND_EXECUTION_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.ISSUE_CREATE,
]);

const TASK_COORDINATION_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.TASK_SCHEDULE_UPDATE,
  STAFF_ACTIONS.TASK_DEADLINE_UPDATE,
]);

const SCHEDULE_EVENT_COORDINATION_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.SCHEDULE_EVENT_CREATE,
  STAFF_ACTIONS.SCHEDULE_EVENT_CONFIRM,
  STAFF_ACTIONS.SCHEDULE_EVENT_CANCEL,
  STAFF_ACTIONS.SCHEDULE_EVENT_UPDATE,
  STAFF_ACTIONS.SCHEDULE_EVENT_LINK_TASKS,
  STAFF_ACTIONS.SCHEDULE_EVENT_UNLINK_TASKS,
]);

const SCHEDULE_EVENT_EXECUTION_ACTIONS = new Set<StaffAction>([STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE]);

const LEAD_VISIT_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CONFIRM,
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CANCEL,
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_RESCHEDULE,
  STAFF_ACTIONS.LEAD_VISIT_COMPLETE,
  STAFF_ACTIONS.LEAD_VISIT_NO_SHOW,
  STAFF_ACTIONS.LEAD_VISIT_OUTCOME_UPDATE,
  STAFF_ACTIONS.LEAD_VISIT_ACCESS_DETAILS_UPDATE,
]);

const LEAD_VISIT_ASSIGNED_FIELD_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CONFIRM,
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_RESCHEDULE,
  STAFF_ACTIONS.LEAD_VISIT_COMPLETE,
  STAFF_ACTIONS.LEAD_VISIT_NO_SHOW,
  STAFF_ACTIONS.LEAD_VISIT_OUTCOME_UPDATE,
  STAFF_ACTIONS.LEAD_VISIT_ACCESS_DETAILS_UPDATE,
]);

const JOB_EXECUTION_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.ISSUE_CREATE,
  STAFF_ACTIONS.DAILY_LOG_DRAFT_UPSERT,
]);

const JOB_ISSUE_EXECUTION_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.RECOVERY_REQUEST,
]);

const JOB_LIFECYCLE_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.JOB_ARCHIVE,
  STAFF_ACTIONS.JOB_SCHEDULE_CLEANUP_CONFIRM,
]);

const WORK_PACKAGE_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.WORK_PACKAGE_CREATE,
  STAFF_ACTIONS.WORK_PACKAGE_TASK_ASSIGN,
]);

const JOB_PAYMENT_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_MARK_PAID,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_WAIVE,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CANCEL,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_PORTAL_LINK_UPDATE,
]);

const OFFICE_COORDINATION_ACTIONS = new Set<StaffAction>([
  STAFF_ACTIONS.ISSUE_RESOLVE,
  STAFF_ACTIONS.ISSUE_FORCE_RESOLVE,
  STAFF_ACTIONS.DAILY_LOG_REVIEW,
  STAFF_ACTIONS.DAILY_LOG_VOID,
  STAFF_ACTIONS.RECOVERY_MANAGE,
  STAFF_ACTIONS.RECOVERY_RESUME,
  STAFF_ACTIONS.RECOVERY_SUGGEST,
  STAFF_ACTIONS.VISIT_SCHEDULE_CREATE,
  STAFF_ACTIONS.VISIT_SCHEDULE_UPDATE,
  STAFF_ACTIONS.VISIT_CANCEL,
  STAFF_ACTIONS.TASK_SCHEDULE_UPDATE,
  STAFF_ACTIONS.TASK_DEADLINE_UPDATE,
  STAFF_ACTIONS.SCHEDULE_EVENT_CREATE,
  STAFF_ACTIONS.SCHEDULE_EVENT_CONFIRM,
  STAFF_ACTIONS.SCHEDULE_EVENT_CANCEL,
  STAFF_ACTIONS.SCHEDULE_EVENT_UPDATE,
  STAFF_ACTIONS.SCHEDULE_EVENT_LINK_TASKS,
  STAFF_ACTIONS.SCHEDULE_EVENT_UNLINK_TASKS,
  STAFF_ACTIONS.SCHEDULE_BLOCK_UPSERT,
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CANCEL,
  STAFF_ACTIONS.JOB_ARCHIVE,
  STAFF_ACTIONS.JOB_SCHEDULE_CLEANUP_CONFIRM,
  STAFF_ACTIONS.WORK_PACKAGE_CREATE,
  STAFF_ACTIONS.WORK_PACKAGE_TASK_ASSIGN,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_MARK_PAID,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_WAIVE,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CANCEL,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_PORTAL_LINK_UPDATE,
]);

const VISIT_EXECUTION_ACTIONS = new Set<StaffAction>([STAFF_ACTIONS.VISIT_COMPLETE]);

function deny(code: AuthzDenyCode, message: string): AuthorizeResult {
  return { ok: false, code, message };
}

function isOfficeRole(role: StaffRole): boolean {
  return (
    role === StaffRole.OWNER || role === StaffRole.ADMIN || role === StaffRole.OFFICE
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function permissionNotExplicitlyFalse(
  permissionsJson: unknown,
  keys: readonly string[],
): boolean {
  if (!isPlainObject(permissionsJson)) return true;
  return keys.every((key) => permissionsJson[key] !== false);
}

function permissionExplicitlyTrue(
  permissionsJson: unknown,
  keys: readonly string[],
): boolean {
  if (!isPlainObject(permissionsJson)) return false;
  return keys.some((key) => permissionsJson[key] === true);
}

function collaboratorCanUseAction(
  action: StaffAction,
  grants: readonly CollaboratorGrant[],
): boolean {
  if (grants.length === 0) return false;

  return grants.some((grant) => {
    if (
      action === STAFF_ACTIONS.TASK_PROOF_UPLOAD_PREPARE ||
      action === STAFF_ACTIONS.TASK_PROOF_UPLOAD_COMPLETE
    ) {
      return permissionNotExplicitlyFalse(grant.permissionsJson, ["upload", "uploadFiles"]);
    }

    if (
      action === STAFF_ACTIONS.TASK_COMPLETE ||
      action === STAFF_ACTIONS.TASK_COMPLETION_NOTE_SAVE ||
      action === STAFF_ACTIONS.TASK_STATUS_UPDATE ||
      action === STAFF_ACTIONS.TASK_CHECKLIST_TOGGLE
    ) {
      return permissionNotExplicitlyFalse(grant.permissionsJson, [
        "updateAssignedTasks",
        "update_assigned_tasks",
        "completeAssignedTasks",
      ]);
    }

    if (action === STAFF_ACTIONS.ISSUE_CREATE || action === STAFF_ACTIONS.RECOVERY_REQUEST) {
      return permissionNotExplicitlyFalse(grant.permissionsJson, [
        "reportIssues",
        "createIssues",
        "requestRecovery",
        "createRecovery",
        "updateAssignedTasks",
        "update_assigned_tasks",
      ]);
    }

    if (action === STAFF_ACTIONS.DAILY_LOG_DRAFT_UPSERT) {
      return permissionNotExplicitlyFalse(grant.permissionsJson, [
        "createDailyLogs",
        "dailyLogs",
        "updateAssignedTasks",
        "update_assigned_tasks",
      ]);
    }

    if (action === STAFF_ACTIONS.VISIT_COMPLETE) {
      return permissionNotExplicitlyFalse(grant.permissionsJson, [
        "completeVisits",
        "updateVisits",
        "updateAssignedTasks",
        "update_assigned_tasks",
      ]);
    }

    if (action === STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE) {
      // Requires an explicit collaborator permission key; updateAssignedTasks is not sufficient.
      return permissionExplicitlyTrue(grant.permissionsJson, [
        "completeScheduleEvents",
        "completeAssignedScheduleEvents",
      ]);
    }

    return false;
  });
}

type ExecutionMutationContext = {
  relationshipScope?: "org" | "assignment" | "collaborator";
  assignedUserId?: string | null;
  collaboratorGrants?: CollaboratorGrant[];
  hasAssignedWork?: boolean;
  requiresTaskAssignment?: boolean;
};

function authorizeExecutionMutation(
  actor: StaffActor,
  action: StaffAction,
  ctx: ExecutionMutationContext,
  metadata: AuthorizeStaffActionInput["metadata"] = {},
): AuthorizeResult {
  if (
    metadata.includesInternalNotes &&
    (actor.role === StaffRole.FIELD || actor.role === StaffRole.SUBCONTRACTOR)
  ) {
    return deny(
      AUTHZ_DENY_CODES.INTERNAL_CONTENT_DENIED,
      "You do not have permission to edit internal notes.",
    );
  }

  if (actor.role === StaffRole.SUBCONTRACTOR) {
    if (!hasCapability(actor.role, "mutate.subcontractor_work")) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
    }
    if (ctx.requiresTaskAssignment && ctx.assignedUserId !== actor.userId) {
      return deny(AUTHZ_DENY_CODES.NOT_ASSIGNED, "This task is not assigned to you.");
    }
    if (!ctx.requiresTaskAssignment && !ctx.hasAssignedWork) {
      return deny(AUTHZ_DENY_CODES.NOT_ASSIGNED, "This job has no work assigned to you.");
    }
    const grants = ctx.collaboratorGrants ?? [];
    if (grants.length === 0) {
      return deny(
        AUTHZ_DENY_CODES.COLLABORATOR_GRANT_REQUIRED,
        "This job requires an active collaborator grant.",
      );
    }
    if (!collaboratorCanUseAction(action, grants)) {
      return deny(
        AUTHZ_DENY_CODES.COLLABORATOR_PERMISSION_DENIED,
        "Your collaborator grant does not allow this action.",
      );
    }
    return { ok: true, scope: "collaborator" };
  }

  if (actor.role === StaffRole.FIELD) {
    if (!hasCapability(actor.role, "mutate.field_work")) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
    }
    if (ctx.relationshipScope !== "assignment") {
      return deny(AUTHZ_DENY_CODES.NOT_ASSIGNED, "This job is not assigned to you.");
    }
    return { ok: true, scope: "assignment" };
  }

  if (isOfficeRole(actor.role)) {
    if (!hasCapability(actor.role, "mutate.office_work")) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
    }
    return { ok: true, scope: "org" };
  }

  return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
}

function leadVisitDenyMessage(action: StaffAction): string {
  if (action === STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CONFIRM) {
    return "You do not have permission to schedule this visit.";
  }
  if (action === STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_RESCHEDULE) {
    return "You do not have permission to reschedule this visit.";
  }
  if (action === STAFF_ACTIONS.LEAD_VISIT_COMPLETE) {
    return "You do not have permission to complete this visit.";
  }
  if (action === STAFF_ACTIONS.LEAD_VISIT_NO_SHOW) {
    return "You do not have permission to mark this visit as no-show.";
  }
  if (action === STAFF_ACTIONS.LEAD_VISIT_OUTCOME_UPDATE) {
    return "You do not have permission to update this visit outcome.";
  }
  if (action === STAFF_ACTIONS.LEAD_VISIT_ACCESS_DETAILS_UPDATE) {
    return "You do not have permission to update visit access details.";
  }
  return "You do not have permission to perform this action.";
}

function authorizeLeadVisitCommercialOrAssignedFieldAction(
  actor: StaffActor,
  action: StaffAction,
  request: LoadedLeadVisitRequestAuthorizationResource,
  metadata: AuthorizeStaffActionInput["metadata"] = {},
): AuthorizeResult {
  const denyMessage = leadVisitDenyMessage(action);

  if (actor.role === StaffRole.SUBCONTRACTOR || actor.role === StaffRole.VIEWER) {
    return deny(AUTHZ_DENY_CODES.ROLE_DENIED, denyMessage);
  }

  if (isOfficeRole(actor.role)) {
    if (
      !hasCapability(actor.role, "mutate.office_work") &&
      !hasCapability(actor.role, "mutate.commercial")
    ) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, denyMessage);
    }
    return { ok: true, scope: "org" };
  }

  if (actor.role !== StaffRole.FIELD) {
    return deny(AUTHZ_DENY_CODES.ROLE_DENIED, denyMessage);
  }

  if (
    metadata.includesInternalNotes &&
    action === STAFF_ACTIONS.LEAD_VISIT_ACCESS_DETAILS_UPDATE
  ) {
    return deny(
      AUTHZ_DENY_CODES.INTERNAL_CONTENT_DENIED,
      "You do not have permission to edit internal access details.",
    );
  }

  if (!hasCapability(actor.role, "mutate.field_work")) {
    return deny(AUTHZ_DENY_CODES.ROLE_DENIED, denyMessage);
  }

  if (request.relationshipScope !== "assignment") {
    return deny(AUTHZ_DENY_CODES.NOT_ASSIGNED, "This visit is not assigned to you.");
  }

  return { ok: true, scope: "assignment" };
}

function authorizeOfficeCoordinationAction(
  actor: StaffActor,
  action: StaffAction,
  resource: { id: string } | null,
  resourceLabel: string,
): AuthorizeResult {
  if (!OFFICE_COORDINATION_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!isOfficeRole(actor.role)) {
    if (action === STAFF_ACTIONS.ISSUE_RESOLVE || action === STAFF_ACTIONS.ISSUE_FORCE_RESOLVE) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to resolve job issues.");
    }
    if (
      action === STAFF_ACTIONS.RECOVERY_MANAGE ||
      action === STAFF_ACTIONS.RECOVERY_RESUME ||
      action === STAFF_ACTIONS.RECOVERY_SUGGEST
    ) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to manage recovery.");
    }
    if (action === STAFF_ACTIONS.DAILY_LOG_REVIEW) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to review daily logs.");
    }
    if (
      action === STAFF_ACTIONS.VISIT_SCHEDULE_CREATE ||
      action === STAFF_ACTIONS.VISIT_SCHEDULE_UPDATE
    ) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to schedule job visits.");
    }
    if (action === STAFF_ACTIONS.VISIT_CANCEL) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to cancel job visits.");
    }
    if (action === STAFF_ACTIONS.TASK_SCHEDULE_UPDATE) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to update task schedule.");
    }
    if (action === STAFF_ACTIONS.TASK_DEADLINE_UPDATE) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to update task deadlines.");
    }
    if (SCHEDULE_EVENT_COORDINATION_ACTIONS.has(action)) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to manage schedule events.");
    }
    if (action === STAFF_ACTIONS.SCHEDULE_BLOCK_UPSERT) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to manage schedule blocks.");
    }
    if (action === STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CANCEL) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to cancel this visit.");
    }
    if (action === STAFF_ACTIONS.JOB_ARCHIVE) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to archive jobs.");
    }
    if (action === STAFF_ACTIONS.JOB_SCHEDULE_CLEANUP_CONFIRM) {
      return deny(
        AUTHZ_DENY_CODES.ROLE_DENIED,
        "You do not have permission to confirm schedule cleanup.",
      );
    }
    if (action === STAFF_ACTIONS.WORK_PACKAGE_CREATE) {
      return deny(
        AUTHZ_DENY_CODES.ROLE_DENIED,
        "You do not have permission to create work packages.",
      );
    }
    if (action === STAFF_ACTIONS.WORK_PACKAGE_TASK_ASSIGN) {
      return deny(
        AUTHZ_DENY_CODES.ROLE_DENIED,
        "You do not have permission to assign tasks to work packages.",
      );
    }
    if (JOB_PAYMENT_ACTIONS.has(action)) {
      return deny(
        AUTHZ_DENY_CODES.ROLE_DENIED,
        "You do not have permission to manage payment requirements.",
      );
    }
    return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to void daily logs.");
  }

  if (!hasCapability(actor.role, "mutate.office_work")) {
    return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
  }

  if (!resource) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, `${resourceLabel} not found or access denied.`);
  }

  return { ok: true, scope: "org" };
}

export function authorizeLoadedJobAction(
  actor: StaffActor,
  action: StaffAction,
  job: LoadedJobAuthorizationResource | null,
  metadata: AuthorizeStaffActionInput["metadata"] = {},
): AuthorizeResult {
  if (!JOB_EXECUTION_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!job) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Job not found or access denied.");
  }

  return authorizeExecutionMutation(
    actor,
    action,
    {
      relationshipScope: job.relationshipScope,
      collaboratorGrants: job.collaboratorGrants,
      hasAssignedWork: job.hasAssignedWork,
      requiresTaskAssignment: false,
    },
    metadata,
  );
}

export function authorizeLoadedJobIssueAction(
  actor: StaffActor,
  action: StaffAction,
  issue: LoadedJobIssueAuthorizationResource | null,
  metadata: AuthorizeStaffActionInput["metadata"] = {},
): AuthorizeResult {
  if (OFFICE_COORDINATION_ACTIONS.has(action)) {
    return authorizeOfficeCoordinationAction(actor, action, issue, "Issue");
  }

  if (!JOB_ISSUE_EXECUTION_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!issue) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Issue not found or access denied.");
  }

  return authorizeExecutionMutation(
    actor,
    action,
    {
      relationshipScope: issue.relationshipScope,
      collaboratorGrants: issue.collaboratorGrants,
      hasAssignedWork: issue.hasAssignedWork,
      requiresTaskAssignment: false,
    },
    metadata,
  );
}

export function authorizeLoadedDailyJobLogAction(
  actor: StaffActor,
  action: StaffAction,
  log: LoadedDailyJobLogAuthorizationResource | null,
): AuthorizeResult {
  return authorizeOfficeCoordinationAction(actor, action, log, "Daily log");
}

export function authorizeLoadedJobLifecycleAction(
  actor: StaffActor,
  action: StaffAction,
  job: LoadedJobAuthorizationResource | null,
): AuthorizeResult {
  if (!JOB_LIFECYCLE_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  return authorizeOfficeCoordinationAction(actor, action, job, "Job");
}

export function authorizeLoadedWorkPackageAction(
  actor: StaffActor,
  action: StaffAction,
  resource: { id: string } | null,
  resourceLabel: "Job" | "Task",
): AuthorizeResult {
  if (!WORK_PACKAGE_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  return authorizeOfficeCoordinationAction(actor, action, resource, resourceLabel);
}

export function authorizeLoadedJobPaymentAction(
  actor: StaffActor,
  action: StaffAction,
  resource: LoadedJobPaymentRequirementAuthorizationResource | null,
  resourceLabel: "Job" | "Payment requirement",
): AuthorizeResult {
  if (!JOB_PAYMENT_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  return authorizeOfficeCoordinationAction(actor, action, resource, resourceLabel);
}

export function authorizeLoadedJobFieldHoldAction(
  actor: StaffActor,
  action: StaffAction,
  job: LoadedJobAuthorizationResource | null,
): AuthorizeResult {
  if (action !== STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!job) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Job not found or access denied.");
  }

  if (actor.role === StaffRole.SUBCONTRACTOR || actor.role === StaffRole.VIEWER) {
    return deny(
      AUTHZ_DENY_CODES.ROLE_DENIED,
      "You do not have permission to create field holds.",
    );
  }

  if (isOfficeRole(actor.role)) {
    if (!hasCapability(actor.role, "mutate.office_work")) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
    }
    return { ok: true, scope: "org" };
  }

  if (actor.role === StaffRole.FIELD) {
    if (!hasCapability(actor.role, "mutate.field_work")) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
    }
    if (job.relationshipScope !== "assignment") {
      return deny(AUTHZ_DENY_CODES.NOT_ASSIGNED, "This job is not assigned to you.");
    }
    return { ok: true, scope: "assignment" };
  }

  return deny(
    AUTHZ_DENY_CODES.ROLE_DENIED,
    "You do not have permission to create field holds.",
  );
}

export function authorizeLoadedJobFieldHoldCancelAction(
  actor: StaffActor,
  action: StaffAction,
  task: { id: string } | null,
  jobRelationshipScope: "org" | "assignment",
): AuthorizeResult {
  if (action !== STAFF_ACTIONS.JOB_FIELD_HOLD_CANCEL) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!task) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Task not found or access denied.");
  }

  if (actor.role === StaffRole.SUBCONTRACTOR || actor.role === StaffRole.VIEWER) {
    return deny(
      AUTHZ_DENY_CODES.ROLE_DENIED,
      "You do not have permission to cancel field holds.",
    );
  }

  if (isOfficeRole(actor.role)) {
    if (!hasCapability(actor.role, "mutate.office_work")) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
    }
    return { ok: true, scope: "org" };
  }

  if (actor.role === StaffRole.FIELD) {
    if (!hasCapability(actor.role, "mutate.field_work")) {
      return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to perform this action.");
    }
    if (jobRelationshipScope !== "assignment") {
      return deny(AUTHZ_DENY_CODES.NOT_ASSIGNED, "This job is not assigned to you.");
    }
    return { ok: true, scope: "assignment" };
  }

  return deny(
    AUTHZ_DENY_CODES.ROLE_DENIED,
    "You do not have permission to cancel field holds.",
  );
}

export function authorizeLoadedJobVisitAction(
  actor: StaffActor,
  action: StaffAction,
  visit: LoadedJobVisitAuthorizationResource | null,
  metadata: AuthorizeStaffActionInput["metadata"] = {},
): AuthorizeResult {
  if (OFFICE_COORDINATION_ACTIONS.has(action)) {
    return authorizeOfficeCoordinationAction(actor, action, visit, "Visit");
  }

  if (!VISIT_EXECUTION_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!visit) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Visit not found or access denied.");
  }

  return authorizeExecutionMutation(
    actor,
    action,
    {
      relationshipScope: visit.relationshipScope,
      assignedUserId: visit.assignedUserId,
      collaboratorGrants: visit.collaboratorGrants,
      requiresTaskAssignment: actor.role === StaffRole.SUBCONTRACTOR,
    },
    metadata,
  );
}

export function authorizeLoadedLeadVisitRequestAction(
  actor: StaffActor,
  action: StaffAction,
  request: LoadedLeadVisitRequestAuthorizationResource | null,
  metadata: AuthorizeStaffActionInput["metadata"] = {},
): AuthorizeResult {
  if (!LEAD_VISIT_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!request) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Visit request not found or access denied.");
  }

  if (action === STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CANCEL) {
    return authorizeOfficeCoordinationAction(actor, action, request, "Visit request");
  }

  if (!LEAD_VISIT_ASSIGNED_FIELD_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  return authorizeLeadVisitCommercialOrAssignedFieldAction(actor, action, request, metadata);
}

export function authorizeLoadedJobScheduleEventAction(
  actor: StaffActor,
  action: StaffAction,
  event: LoadedJobScheduleEventAuthorizationResource | null,
  metadata: AuthorizeStaffActionInput["metadata"] = {},
): AuthorizeResult {
  if (action === STAFF_ACTIONS.SCHEDULE_EVENT_CREATE) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (SCHEDULE_EVENT_COORDINATION_ACTIONS.has(action)) {
    return authorizeOfficeCoordinationAction(actor, action, event, "Schedule event");
  }

  if (!SCHEDULE_EVENT_EXECUTION_ACTIONS.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (
    metadata.scheduledStartAt != null ||
    metadata.scheduledEndAt != null ||
    metadata.dueAt != null ||
    metadata.externalWindowStartAt != null ||
    metadata.externalWindowEndAt != null
  ) {
    return deny(
      AUTHZ_DENY_CODES.ROLE_DENIED,
      "You do not have permission to reschedule schedule events.",
    );
  }

  if (!event) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Schedule event not found or access denied.");
  }

  return authorizeExecutionMutation(
    actor,
    action,
    {
      relationshipScope: event.relationshipScope,
      assignedUserId: event.leadUserId,
      collaboratorGrants: event.collaboratorGrants,
      requiresTaskAssignment: actor.role === StaffRole.SUBCONTRACTOR,
    },
    metadata,
  );
}

export function authorizeLoadedScheduleBlockAction(
  actor: StaffActor,
  action: StaffAction,
  block: LoadedScheduleBlockAuthorizationResource | null,
): AuthorizeResult {
  if (action !== STAFF_ACTIONS.SCHEDULE_BLOCK_UPSERT) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  return authorizeOfficeCoordinationAction(actor, action, block, "Schedule block");
}

export function authorizeLoadedTaskAction(
  actor: StaffActor,
  action: StaffAction,
  task: LoadedTaskAuthorizationResource | null,
  metadata: AuthorizeStaffActionInput["metadata"] = {},
): AuthorizeResult {
  if (TASK_COORDINATION_ACTIONS.has(action) || action === STAFF_ACTIONS.WORK_PACKAGE_TASK_ASSIGN) {
    return authorizeOfficeCoordinationAction(actor, action, task, "Task");
  }

  const supportedActions = new Set<StaffAction>([
    ...MUTATE_TASK_ACTIONS,
    ...TASK_BOUND_EXECUTION_ACTIONS,
  ]);

  if (!supportedActions.has(action)) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!task) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Task not found or access denied.");
  }

  if (MUTATE_TASK_ACTIONS.has(action)) {
    if (
      task.status === JobTaskStatus.DONE &&
      !(action === STAFF_ACTIONS.TASK_STATUS_UPDATE && metadata.targetStatus === JobTaskStatus.TODO)
    ) {
      return deny(AUTHZ_DENY_CODES.TASK_ALREADY_DONE, "Task is already completed.");
    }

    if (task.status === JobTaskStatus.CANCELED && action !== STAFF_ACTIONS.TASK_STATUS_UPDATE) {
      return deny(AUTHZ_DENY_CODES.TASK_CANCELED, "Canceled tasks cannot be changed.");
    }
  }

  if (action === STAFF_ACTIONS.TASK_READINESS_OVERRIDE) {
    if (isOfficeRole(actor.role)) {
      return { ok: true, scope: "org" };
    }
    return deny(
      AUTHZ_DENY_CODES.ROLE_DENIED,
      "You do not have permission to override task readiness.",
    );
  }

  return authorizeExecutionMutation(
    actor,
    action,
    {
      relationshipScope: task.relationshipScope,
      assignedUserId: task.assignedUserId,
      collaboratorGrants: task.collaboratorGrants,
      requiresTaskAssignment: actor.role === StaffRole.SUBCONTRACTOR,
    },
    metadata,
  );
}

export function authorizeLoadedJobStageAction(
  actor: StaffActor,
  action: StaffAction,
  jobStage: LoadedJobStageAuthorizationResource | null,
): AuthorizeResult {
  if (action !== STAFF_ACTIONS.TASK_CREATE) {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_ACTION, "This action is not supported.");
  }

  if (!jobStage) {
    return deny(AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND, "Job stage not found or access denied.");
  }

  if (isOfficeRole(actor.role)) {
    return { ok: true, scope: "org" };
  }

  if (actor.role === StaffRole.FIELD) {
    if (jobStage.relationshipScope !== "assignment") {
      return deny(AUTHZ_DENY_CODES.NOT_ASSIGNED, "This job is not assigned to you.");
    }
    return { ok: true, scope: "assignment" };
  }

  return deny(AUTHZ_DENY_CODES.ROLE_DENIED, "You do not have permission to add tasks.");
}

export async function authorizeStaffAction(
  actor: StaffActor,
  input: AuthorizeStaffActionInput,
): Promise<AuthorizeResult> {
  if (input.resourceType === "jobStage") {
    const stage = await db.jobStage.findFirst({
      where: {
        id: input.resourceId,
        job: {
          organizationId: actor.organizationId,
          ...getJobVisibilityWhere(actor.role, actor.userId),
        },
      },
      select: { id: true },
    });

    return authorizeLoadedJobStageAction(
      actor,
      input.action,
      stage
        ? {
            id: stage.id,
            relationshipScope: actor.role === StaffRole.FIELD ? "assignment" : "org",
          }
        : null,
    );
  }

  if (input.resourceType === "job") {
    if (
      input.action === STAFF_ACTIONS.VISIT_SCHEDULE_CREATE ||
      input.action === STAFF_ACTIONS.SCHEDULE_EVENT_CREATE ||
      JOB_LIFECYCLE_ACTIONS.has(input.action) ||
      input.action === STAFF_ACTIONS.WORK_PACKAGE_CREATE ||
      input.action === STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE
    ) {
      const job = await db.job.findFirst({
        where: {
          id: input.resourceId,
          organizationId: actor.organizationId,
        },
        select: { id: true },
      });

      if (JOB_LIFECYCLE_ACTIONS.has(input.action)) {
        return authorizeLoadedJobLifecycleAction(
          actor,
          input.action,
          job ? { id: job.id } : null,
        );
      }

      if (input.action === STAFF_ACTIONS.WORK_PACKAGE_CREATE) {
        return authorizeLoadedWorkPackageAction(
          actor,
          input.action,
          job ? { id: job.id } : null,
          "Job",
        );
      }

      if (input.action === STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE) {
        return authorizeLoadedJobPaymentAction(
          actor,
          input.action,
          job ? { id: job.id } : null,
          "Job",
        );
      }

      return authorizeOfficeCoordinationAction(actor, input.action, job, "Job");
    }

    const job = await db.job.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
        ...getJobVisibilityWhere(actor.role, actor.userId),
      },
      select: {
        id: true,
        collaborators: {
          where: {
            userId: actor.userId,
            status: "ACTIVE",
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { permissionsJson: true },
        },
        tasks:
          actor.role === StaffRole.SUBCONTRACTOR
            ? {
                where: { assignedUserId: actor.userId },
                select: { id: true },
                take: 1,
              }
            : undefined,
      },
    });

    const loadedJob = job
      ? {
          id: job.id,
          relationshipScope:
            actor.role === StaffRole.SUBCONTRACTOR
              ? ("collaborator" as const)
              : actor.role === StaffRole.FIELD
                ? ("assignment" as const)
                : ("org" as const),
          collaboratorGrants: job.collaborators,
          hasAssignedWork:
            actor.role === StaffRole.SUBCONTRACTOR ? job.tasks.length > 0 : undefined,
        }
      : null;

    if (input.action === STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE) {
      return authorizeLoadedJobFieldHoldAction(actor, input.action, loadedJob);
    }

    return authorizeLoadedJobAction(actor, input.action, loadedJob, input.metadata);
  }

  if (input.resourceType === "jobIssue") {
    const issue = await db.jobIssue.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
        job: {
          ...getJobVisibilityWhere(actor.role, actor.userId),
        },
      },
      select: {
        id: true,
        job: {
          select: {
            id: true,
            collaborators: {
              where: {
                userId: actor.userId,
                status: "ACTIVE",
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              select: { permissionsJson: true },
            },
            tasks:
              actor.role === StaffRole.SUBCONTRACTOR
                ? {
                    where: { assignedUserId: actor.userId },
                    select: { id: true },
                    take: 1,
                  }
                : undefined,
          },
        },
      },
    });

    return authorizeLoadedJobIssueAction(
      actor,
      input.action,
      issue
        ? {
            id: issue.id,
            relationshipScope:
              actor.role === StaffRole.SUBCONTRACTOR
                ? "collaborator"
                : actor.role === StaffRole.FIELD
                  ? "assignment"
                  : "org",
            collaboratorGrants: issue.job.collaborators,
            hasAssignedWork:
              actor.role === StaffRole.SUBCONTRACTOR ? issue.job.tasks.length > 0 : undefined,
          }
        : null,
      input.metadata,
    );
  }

  if (input.resourceType === "jobRecoveryFlow") {
    const flow = await db.jobRecoveryFlow.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
      },
      select: { id: true },
    });

    return authorizeOfficeCoordinationAction(actor, input.action, flow, "Recovery flow");
  }

  if (input.resourceType === "dailyJobLog") {
    const log = await db.dailyJobLog.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
      },
      select: { id: true },
    });

    return authorizeLoadedDailyJobLogAction(actor, input.action, log);
  }

  if (input.resourceType === "jobVisit") {
    const isOfficeVisitAction = OFFICE_COORDINATION_ACTIONS.has(input.action);

    const visit = await db.jobVisit.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
        ...(isOfficeVisitAction
          ? {}
          : {
              job: {
                ...getJobVisibilityWhere(actor.role, actor.userId),
              },
            }),
      },
      select: {
        id: true,
        assignedUserId: true,
        job: {
          select: {
            collaborators: {
              where: {
                userId: actor.userId,
                status: "ACTIVE",
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              select: { permissionsJson: true },
            },
          },
        },
      },
    });

    const fieldVisitAssignment =
      visit && actor.role === StaffRole.FIELD && input.action === STAFF_ACTIONS.VISIT_COMPLETE
        ? await db.jobVisit.findFirst({
            where: {
              id: visit.id,
              ...getVisitExecutionAssignmentWhere(actor.role, actor.userId, visit.id),
            },
            select: { id: true },
          })
        : null;

    return authorizeLoadedJobVisitAction(
      actor,
      input.action,
      visit
        ? {
            id: visit.id,
            assignedUserId: visit.assignedUserId,
            relationshipScope:
              actor.role === StaffRole.SUBCONTRACTOR
                ? "collaborator"
                : actor.role === StaffRole.FIELD
                  ? fieldVisitAssignment
                    ? "assignment"
                    : "org"
                  : "org",
            collaboratorGrants: visit.job.collaborators,
          }
        : null,
      input.metadata,
    );
  }

  if (input.resourceType === "leadVisitRequest") {
    const request = await db.leadVisitRequest.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
        assignedUserId: true,
      },
    });

    return authorizeLoadedLeadVisitRequestAction(
      actor,
      input.action,
      request
        ? {
            id: request.id,
            assignedUserId: request.assignedUserId,
            relationshipScope:
              request.assignedUserId === actor.userId ? "assignment" : "org",
          }
        : null,
      input.metadata,
    );
  }

  if (input.resourceType === "jobScheduleEvent") {
    const isOfficeScheduleEventAction = SCHEDULE_EVENT_COORDINATION_ACTIONS.has(input.action);
    const isScheduleEventComplete = input.action === STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE;

    const event = await db.jobScheduleEvent.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
        ...(isOfficeScheduleEventAction
          ? {}
          : isScheduleEventComplete && isOfficeRole(actor.role)
            ? {}
            : isScheduleEventComplete
              ? {
                  job: {
                    ...getJobVisibilityWhere(actor.role, actor.userId),
                  },
                }
              : {}),
      },
      select: {
        id: true,
        leadUserId: true,
        job: {
          select: {
            collaborators: {
              where: {
                userId: actor.userId,
                status: "ACTIVE",
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              select: { permissionsJson: true },
            },
          },
        },
      },
    });

    const fieldEventLead =
      event &&
      actor.role === StaffRole.FIELD &&
      input.action === STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE &&
      event.leadUserId === actor.userId;

    return authorizeLoadedJobScheduleEventAction(
      actor,
      input.action,
      event
        ? {
            id: event.id,
            leadUserId: event.leadUserId,
            relationshipScope:
              actor.role === StaffRole.SUBCONTRACTOR
                ? "collaborator"
                : actor.role === StaffRole.FIELD
                  ? fieldEventLead
                    ? "assignment"
                    : "org"
                  : "org",
            collaboratorGrants: event.job.collaborators,
          }
        : null,
      input.metadata,
    );
  }

  if (input.resourceType === "scheduleBlock") {
    if (input.resourceId === "new") {
      return authorizeLoadedScheduleBlockAction(actor, input.action, { id: "new" });
    }

    const block = await db.scheduleBlock.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
      },
      select: { id: true },
    });

    return authorizeLoadedScheduleBlockAction(
      actor,
      input.action,
      block ? { id: block.id } : null,
    );
  }

  if (input.resourceType === "jobPaymentRequirement") {
    const requirement = await db.jobPaymentRequirement.findFirst({
      where: {
        id: input.resourceId,
        organizationId: actor.organizationId,
      },
      select: { id: true },
    });

    return authorizeLoadedJobPaymentAction(
      actor,
      input.action,
      requirement ? { id: requirement.id } : null,
      "Payment requirement",
    );
  }

  if (input.resourceType !== "jobTask") {
    return deny(AUTHZ_DENY_CODES.UNSUPPORTED_RESOURCE, "This resource type is not supported.");
  }

  if (input.action === STAFF_ACTIONS.JOB_FIELD_HOLD_CANCEL) {
    const holdTask = await db.jobTask.findFirst({
      where: {
        id: input.resourceId,
        job: { organizationId: actor.organizationId },
      },
      select: { id: true, jobId: true },
    });

    let jobRelationshipScope: "org" | "assignment" = "org";
    if (holdTask && actor.role === StaffRole.FIELD) {
      const assignedJob = await db.job.findFirst({
        where: {
          id: holdTask.jobId,
          organizationId: actor.organizationId,
          ...getJobVisibilityWhere(actor.role, actor.userId),
        },
        select: { id: true },
      });
      jobRelationshipScope = assignedJob ? "assignment" : "org";
    }

    return authorizeLoadedJobFieldHoldCancelAction(
      actor,
      input.action,
      holdTask ? { id: holdTask.id } : null,
      jobRelationshipScope,
    );
  }

  const isOfficeOnlyTaskAction =
    TASK_COORDINATION_ACTIONS.has(input.action) ||
    input.action === STAFF_ACTIONS.WORK_PACKAGE_TASK_ASSIGN;

  const task = await db.jobTask.findFirst({
    where: {
      id: input.resourceId,
      job: {
        organizationId: actor.organizationId,
        ...(isOfficeOnlyTaskAction ? {} : getJobVisibilityWhere(actor.role, actor.userId)),
      },
    },
    select: {
      id: true,
      status: true,
      assignedUserId: true,
      job: {
        select: {
          collaborators: {
            where: {
              userId: actor.userId,
              status: "ACTIVE",
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { permissionsJson: true },
          },
        },
      },
    },
  });

  const fieldTaskAssignment =
    task && actor.role === StaffRole.FIELD && !isOfficeOnlyTaskAction
      ? await db.jobTask.findFirst({
          where: {
            id: task.id,
            ...getTaskVisibilityWhere(actor.role, actor.userId),
          },
          select: { id: true },
        })
      : null;

  return authorizeLoadedTaskAction(
    actor,
    input.action,
    task
      ? {
          id: task.id,
          status: task.status,
          assignedUserId: task.assignedUserId,
          relationshipScope:
            actor.role === StaffRole.SUBCONTRACTOR
              ? "collaborator"
              : actor.role === StaffRole.FIELD
                ? fieldTaskAssignment
                  ? "assignment"
                  : "org"
                : "org",
          collaboratorGrants: task.job.collaborators,
        }
      : null,
    input.metadata,
  );
}

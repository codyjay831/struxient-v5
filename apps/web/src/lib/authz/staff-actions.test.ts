import assert from "node:assert/strict";
import { JobTaskStatus, StaffRole } from "@prisma/client";
import {
  AUTHZ_DENY_CODES,
  authorizeLoadedDailyJobLogAction,
  authorizeLoadedJobAction,
  authorizeLoadedJobFieldHoldAction,
  authorizeLoadedJobFieldHoldCancelAction,
  authorizeLoadedJobIssueAction,
  authorizeLoadedJobLifecycleAction,
  authorizeLoadedJobStageAction,
  authorizeLoadedWorkPackageAction,
  authorizeLoadedJobPaymentAction,
  authorizeLoadedJobScheduleEventAction,
  authorizeLoadedLeadVisitRequestAction,
  authorizeLoadedJobVisitAction,
  authorizeLoadedScheduleBlockAction,
  authorizeLoadedTaskAction,
  STAFF_ACTIONS,
  type StaffAction,
  type LoadedJobAuthorizationResource,
  type LoadedTaskAuthorizationResource,
  type LoadedJobVisitAuthorizationResource,
  type LoadedJobScheduleEventAuthorizationResource,
  type LoadedLeadVisitRequestAuthorizationResource,
  type StaffActor,
} from "./staff-actions";

const jobBase: LoadedJobAuthorizationResource = {
  id: "job-1",
  relationshipScope: "assignment",
  hasAssignedWork: true,
  collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
};

const taskBase: LoadedTaskAuthorizationResource = {
  id: "task-1",
  status: JobTaskStatus.TODO,
  assignedUserId: "field-1",
};

function actor(role: StaffRole, userId = "field-1"): StaffActor {
  return {
    organizationId: "org-1",
    userId,
    role,
  };
}

assert.equal(
  authorizeLoadedJobStageAction(actor(StaffRole.OWNER), STAFF_ACTIONS.TASK_CREATE, {
    id: "stage-1",
    relationshipScope: "org",
  }).ok,
  true,
);

assert.equal(
  authorizeLoadedJobStageAction(actor(StaffRole.FIELD), STAFF_ACTIONS.TASK_CREATE, {
    id: "stage-1",
    relationshipScope: "assignment",
  }).ok,
  true,
);

const subcontractorCreateResult = authorizeLoadedJobStageAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.TASK_CREATE,
  {
    id: "stage-1",
    relationshipScope: "org",
  },
);
assert.equal(subcontractorCreateResult.ok, false);
if (!subcontractorCreateResult.ok) {
  assert.equal(subcontractorCreateResult.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  assert.match(subcontractorCreateResult.message, /add tasks/i);
}

const migratedTaskActions: StaffAction[] = [
  STAFF_ACTIONS.TASK_COMPLETE,
  STAFF_ACTIONS.TASK_COMPLETION_NOTE_SAVE,
  STAFF_ACTIONS.TASK_STATUS_UPDATE,
  STAFF_ACTIONS.TASK_CHECKLIST_TOGGLE,
  STAFF_ACTIONS.TASK_PROOF_UPLOAD_PREPARE,
  STAFF_ACTIONS.TASK_PROOF_UPLOAD_COMPLETE,
];

for (const action of migratedTaskActions) {
  assert.equal(
    authorizeLoadedTaskAction(actor(StaffRole.OWNER), action, {
      ...taskBase,
      relationshipScope: "org",
    }).ok,
    true,
    `OWNER should be allowed for ${action}`,
  );

  assert.equal(
    authorizeLoadedTaskAction(actor(StaffRole.FIELD), action, {
      ...taskBase,
      relationshipScope: "assignment",
    }).ok,
    true,
    `assigned FIELD should be allowed for ${action}`,
  );
}

assert.equal(
  authorizeLoadedTaskAction(actor(StaffRole.OWNER), STAFF_ACTIONS.TASK_READINESS_OVERRIDE, {
    ...taskBase,
    relationshipScope: "org",
  }).ok,
  true,
);

const viewerResult = authorizeLoadedTaskAction(actor(StaffRole.VIEWER), STAFF_ACTIONS.TASK_COMPLETE, {
  ...taskBase,
  relationshipScope: "org",
});
assert.equal(viewerResult.ok, false);
if (!viewerResult.ok) {
  assert.equal(viewerResult.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const unassignedFieldResult = authorizeLoadedTaskAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.TASK_CHECKLIST_TOGGLE,
  {
    ...taskBase,
    assignedUserId: "someone-else",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(unassignedFieldResult.ok, false);
if (!unassignedFieldResult.ok) {
  assert.equal(unassignedFieldResult.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
  assert.match(unassignedFieldResult.message, /not assigned/i);
}

const fieldOverrideResult = authorizeLoadedTaskAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.TASK_READINESS_OVERRIDE,
  {
    ...taskBase,
    relationshipScope: "assignment",
  },
);
assert.equal(fieldOverrideResult.ok, false);
if (!fieldOverrideResult.ok) {
  assert.equal(fieldOverrideResult.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  assert.match(fieldOverrideResult.message, /override task readiness/i);
}

const subcontractorWithoutGrantResult = authorizeLoadedTaskAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.TASK_COMPLETE,
  {
    ...taskBase,
    assignedUserId: "sub-1",
    relationshipScope: "collaborator",
    collaboratorGrants: [],
  },
);
assert.equal(subcontractorWithoutGrantResult.ok, false);
if (!subcontractorWithoutGrantResult.ok) {
  assert.equal(subcontractorWithoutGrantResult.code, AUTHZ_DENY_CODES.COLLABORATOR_GRANT_REQUIRED);
}

const subcontractorUnassignedResult = authorizeLoadedTaskAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.TASK_COMPLETE,
  {
    ...taskBase,
    assignedUserId: "someone-else",
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true, upload: true } }],
  },
);
assert.equal(subcontractorUnassignedResult.ok, false);
if (!subcontractorUnassignedResult.ok) {
  assert.equal(subcontractorUnassignedResult.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

assert.equal(
  authorizeLoadedTaskAction(actor(StaffRole.SUBCONTRACTOR, "sub-1"), STAFF_ACTIONS.TASK_COMPLETE, {
    ...taskBase,
    assignedUserId: "sub-1",
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true, upload: true } }],
  }).ok,
  true,
);

assert.equal(
  authorizeLoadedTaskAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    STAFF_ACTIONS.TASK_CHECKLIST_TOGGLE,
    {
      ...taskBase,
      assignedUserId: "sub-1",
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
    },
  ).ok,
  true,
);

const subcontractorPermissionResult = authorizeLoadedTaskAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.TASK_PROOF_UPLOAD_COMPLETE,
  {
    ...taskBase,
    assignedUserId: "sub-1",
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { upload: false } }],
  },
);
assert.equal(subcontractorPermissionResult.ok, false);
if (!subcontractorPermissionResult.ok) {
  assert.equal(subcontractorPermissionResult.code, AUTHZ_DENY_CODES.COLLABORATOR_PERMISSION_DENIED);
}

const completedTaskResult = authorizeLoadedTaskAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.TASK_COMPLETE,
  {
    ...taskBase,
    status: JobTaskStatus.DONE,
    relationshipScope: "assignment",
  },
);
assert.equal(completedTaskResult.ok, false);
if (!completedTaskResult.ok) {
  assert.equal(completedTaskResult.code, AUTHZ_DENY_CODES.TASK_ALREADY_DONE);
}

assert.equal(
  authorizeLoadedTaskAction(
    actor(StaffRole.FIELD),
    STAFF_ACTIONS.TASK_STATUS_UPDATE,
    {
      ...taskBase,
      status: JobTaskStatus.DONE,
      relationshipScope: "assignment",
    },
    { targetStatus: JobTaskStatus.TODO },
  ).ok,
  true,
);

// --- Verification: complete vs status update use the same authorization rules ---
const parityActions = [STAFF_ACTIONS.TASK_COMPLETE, STAFF_ACTIONS.TASK_STATUS_UPDATE] as const;
for (const action of parityActions) {
  const fieldDeny = authorizeLoadedTaskAction(
    actor(StaffRole.FIELD),
    action,
    { ...taskBase, relationshipScope: "org" },
    action === STAFF_ACTIONS.TASK_STATUS_UPDATE ? { targetStatus: JobTaskStatus.CANCELED } : undefined,
  );
  assert.equal(fieldDeny.ok, false, `${action} should deny unassigned FIELD`);
  if (!fieldDeny.ok) {
    assert.equal(fieldDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
  }

  const subDeny = authorizeLoadedTaskAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    action,
    {
      ...taskBase,
      assignedUserId: "field-1",
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
    },
    action === STAFF_ACTIONS.TASK_STATUS_UPDATE ? { targetStatus: JobTaskStatus.CANCELED } : undefined,
  );
  assert.equal(subDeny.ok, false, `${action} should deny SUB on task assigned to someone else`);
  if (!subDeny.ok) {
    assert.equal(subDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
  }
}

// --- Verification: readiness override requires OFFICE+ (not reachable by FIELD/SUB) ---
for (const role of [StaffRole.FIELD, StaffRole.SUBCONTRACTOR] as const) {
  const result = authorizeLoadedTaskAction(
    actor(role, role === StaffRole.SUBCONTRACTOR ? "sub-1" : "field-1"),
    STAFF_ACTIONS.TASK_READINESS_OVERRIDE,
    {
      ...taskBase,
      assignedUserId: role === StaffRole.SUBCONTRACTOR ? "sub-1" : "field-1",
      relationshipScope: role === StaffRole.FIELD ? "assignment" : "collaborator",
      collaboratorGrants:
        role === StaffRole.SUBCONTRACTOR
          ? [{ permissionsJson: { updateAssignedTasks: true } }]
          : undefined,
    },
  );
  assert.equal(result.ok, false, `${role} must not be allowed readiness override`);
  if (!result.ok) {
    assert.equal(result.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

// --- Verification: assigneeRole never grants access without real assignment ---
const assigneeRoleOnlyResult = authorizeLoadedTaskAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.TASK_COMPLETE,
  {
    ...taskBase,
    assignedUserId: "field-1",
    assigneeRole: StaffRole.SUBCONTRACTOR,
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true, upload: true } }],
  },
);
assert.equal(assigneeRoleOnlyResult.ok, false);
if (!assigneeRoleOnlyResult.ok) {
  assert.equal(assigneeRoleOnlyResult.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

// --- Verification: office coordination roles retain org-wide task mutation ---
for (const role of [StaffRole.OFFICE, StaffRole.ADMIN] as const) {
  for (const action of [...migratedTaskActions, STAFF_ACTIONS.TASK_READINESS_OVERRIDE]) {
    assert.equal(
      authorizeLoadedTaskAction(actor(role), action, {
        ...taskBase,
        relationshipScope: "org",
      }).ok,
      true,
      `${role} should be allowed for ${action}`,
    );
  }
}

// --- Verification: deny messages are human-readable (not opaque codes) ---
const sampleDenies = [
  authorizeLoadedTaskAction(actor(StaffRole.FIELD), STAFF_ACTIONS.TASK_COMPLETE, {
    ...taskBase,
    relationshipScope: "org",
  }),
  authorizeLoadedTaskAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    STAFF_ACTIONS.TASK_COMPLETE,
    {
      ...taskBase,
      assignedUserId: "field-1",
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
    },
  ),
];
for (const result of sampleDenies) {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /[a-z]/i);
    assert.doesNotMatch(result.message, /^[A-Z_]+$/);
  }
}

// --- Issue + daily log execution slice ---
const executionFieldActions = [
  STAFF_ACTIONS.ISSUE_CREATE,
  STAFF_ACTIONS.DAILY_LOG_DRAFT_UPSERT,
] as const;

for (const action of executionFieldActions) {
  assert.equal(
    authorizeLoadedJobAction(actor(StaffRole.FIELD), action, {
      ...jobBase,
      relationshipScope: "assignment",
    }).ok,
    true,
    `assigned FIELD should create ${action} on accessible job`,
  );

  const unassignedFieldJob = authorizeLoadedJobAction(
    actor(StaffRole.FIELD),
    action,
    { ...jobBase, relationshipScope: "org" },
  );
  assert.equal(unassignedFieldJob.ok, false);
  if (!unassignedFieldJob.ok) {
    assert.equal(unassignedFieldJob.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
  }
}

assert.equal(
  authorizeLoadedTaskAction(actor(StaffRole.FIELD), STAFF_ACTIONS.ISSUE_CREATE, {
    ...taskBase,
    relationshipScope: "assignment",
  }).ok,
  true,
);

const directIdFieldDeny = authorizeLoadedJobAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.ISSUE_CREATE,
  null,
);
assert.equal(directIdFieldDeny.ok, false);
if (!directIdFieldDeny.ok) {
  assert.equal(directIdFieldDeny.code, AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND);
}

assert.equal(
  authorizeLoadedTaskAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    STAFF_ACTIONS.ISSUE_CREATE,
    {
      ...taskBase,
      assignedUserId: "sub-1",
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { reportIssues: true } }],
    },
  ).ok,
  true,
);

const subCollaboratorNoAssignment = authorizeLoadedJobAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.DAILY_LOG_DRAFT_UPSERT,
  {
    ...jobBase,
    relationshipScope: "collaborator",
    hasAssignedWork: false,
    collaboratorGrants: [{ permissionsJson: { createDailyLogs: true } }],
  },
);
assert.equal(subCollaboratorNoAssignment.ok, false);
if (!subCollaboratorNoAssignment.ok) {
  assert.equal(subCollaboratorNoAssignment.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const subWrongTaskAssignee = authorizeLoadedTaskAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.ISSUE_CREATE,
  {
    ...taskBase,
    assignedUserId: "field-1",
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { reportIssues: true } }],
  },
);
assert.equal(subWrongTaskAssignee.ok, false);
if (!subWrongTaskAssignee.ok) {
  assert.equal(subWrongTaskAssignee.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const viewerIssueCreate = authorizeLoadedJobAction(
  actor(StaffRole.VIEWER),
  STAFF_ACTIONS.ISSUE_CREATE,
  { ...jobBase, relationshipScope: "org" },
);
assert.equal(viewerIssueCreate.ok, false);
if (!viewerIssueCreate.ok) {
  assert.equal(viewerIssueCreate.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  assert.equal(
    authorizeLoadedJobAction(actor(role), STAFF_ACTIONS.ISSUE_CREATE, {
      ...jobBase,
      relationshipScope: "org",
    }).ok,
    true,
  );
  assert.equal(
    authorizeLoadedJobIssueAction(actor(role), STAFF_ACTIONS.ISSUE_RESOLVE, { id: "issue-1" }).ok,
    true,
  );
  assert.equal(
    authorizeLoadedDailyJobLogAction(actor(role), STAFF_ACTIONS.DAILY_LOG_VOID, { id: "log-1" }).ok,
    true,
  );
}

const fieldResolveDeny = authorizeLoadedJobIssueAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.ISSUE_RESOLVE,
  { id: "issue-1" },
);
assert.equal(fieldResolveDeny.ok, false);
if (!fieldResolveDeny.ok) {
  assert.equal(fieldResolveDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const fieldInternalNotesDeny = authorizeLoadedJobAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.DAILY_LOG_DRAFT_UPSERT,
  { ...jobBase, relationshipScope: "assignment" },
  { includesInternalNotes: true },
);
assert.equal(fieldInternalNotesDeny.ok, false);
if (!fieldInternalNotesDeny.ok) {
  assert.equal(fieldInternalNotesDeny.code, AUTHZ_DENY_CODES.INTERNAL_CONTENT_DENIED);
}

const assigneeRoleIssueDeny = authorizeLoadedTaskAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.ISSUE_CREATE,
  {
    ...taskBase,
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(assigneeRoleIssueDeny.ok, false);
if (!assigneeRoleIssueDeny.ok) {
  assert.equal(assigneeRoleIssueDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

// --- Recovery execution slice ---
assert.equal(
  authorizeLoadedJobIssueAction(actor(StaffRole.FIELD), STAFF_ACTIONS.RECOVERY_REQUEST, {
    id: "issue-1",
    relationshipScope: "assignment",
  }).ok,
  true,
  "assigned FIELD should be allowed to request recovery",
);

const fieldRecoveryDirectIdDeny = authorizeLoadedJobIssueAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.RECOVERY_REQUEST,
  null,
);
assert.equal(fieldRecoveryDirectIdDeny.ok, false);
if (!fieldRecoveryDirectIdDeny.ok) {
  assert.equal(fieldRecoveryDirectIdDeny.code, AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND);
}

const fieldRecoveryUnassignedDeny = authorizeLoadedJobIssueAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.RECOVERY_REQUEST,
  {
    id: "issue-1",
    relationshipScope: "org",
  },
);
assert.equal(fieldRecoveryUnassignedDeny.ok, false);
if (!fieldRecoveryUnassignedDeny.ok) {
  assert.equal(fieldRecoveryUnassignedDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const subRecoveryWithoutGrantDeny = authorizeLoadedJobIssueAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.RECOVERY_REQUEST,
  {
    id: "issue-1",
    relationshipScope: "collaborator",
    hasAssignedWork: true,
    collaboratorGrants: [],
  },
);
assert.equal(subRecoveryWithoutGrantDeny.ok, false);
if (!subRecoveryWithoutGrantDeny.ok) {
  assert.equal(subRecoveryWithoutGrantDeny.code, AUTHZ_DENY_CODES.COLLABORATOR_GRANT_REQUIRED);
}

const subRecoveryGrantNoAssignmentDeny = authorizeLoadedJobIssueAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.RECOVERY_REQUEST,
  {
    id: "issue-1",
    relationshipScope: "collaborator",
    hasAssignedWork: false,
    collaboratorGrants: [{ permissionsJson: { requestRecovery: true } }],
  },
);
assert.equal(subRecoveryGrantNoAssignmentDeny.ok, false);
if (!subRecoveryGrantNoAssignmentDeny.ok) {
  assert.equal(subRecoveryGrantNoAssignmentDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

assert.equal(
  authorizeLoadedJobIssueAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    STAFF_ACTIONS.RECOVERY_REQUEST,
    {
      id: "issue-1",
      relationshipScope: "collaborator",
      hasAssignedWork: true,
      collaboratorGrants: [{ permissionsJson: { requestRecovery: true } }],
    },
  ).ok,
  true,
  "SUB should be allowed to request recovery only with grant and assigned work",
);

const recoveryManagementActions = [
  STAFF_ACTIONS.RECOVERY_MANAGE,
  STAFF_ACTIONS.RECOVERY_RESUME,
  STAFF_ACTIONS.RECOVERY_SUGGEST,
] as const;

for (const action of recoveryManagementActions) {
  const fieldRecoveryManagementDeny = authorizeLoadedJobIssueAction(
    actor(StaffRole.FIELD),
    action,
    { id: "issue-1", relationshipScope: "assignment" },
  );
  assert.equal(fieldRecoveryManagementDeny.ok, false, `FIELD should be denied ${action}`);
  if (!fieldRecoveryManagementDeny.ok) {
    assert.equal(fieldRecoveryManagementDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }

  const subRecoveryManagementDeny = authorizeLoadedJobIssueAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    action,
    {
      id: "issue-1",
      relationshipScope: "collaborator",
      hasAssignedWork: true,
      collaboratorGrants: [{ permissionsJson: { requestRecovery: true } }],
    },
  );
  assert.equal(subRecoveryManagementDeny.ok, false, `SUB should be denied ${action}`);
  if (!subRecoveryManagementDeny.ok) {
    assert.equal(subRecoveryManagementDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  assert.equal(
    authorizeLoadedJobIssueAction(actor(role), STAFF_ACTIONS.RECOVERY_REQUEST, {
      id: "issue-1",
      relationshipScope: "org",
    }).ok,
    true,
    `${role} should be allowed to request recovery`,
  );

  for (const action of recoveryManagementActions) {
    assert.equal(
      authorizeLoadedJobIssueAction(actor(role), action, { id: "issue-1" }).ok,
      true,
      `${role} should be allowed for ${action}`,
    );
  }
}

const viewerRecoveryDeny = authorizeLoadedJobIssueAction(
  actor(StaffRole.VIEWER),
  STAFF_ACTIONS.RECOVERY_REQUEST,
  {
    id: "issue-1",
    relationshipScope: "org",
  },
);
assert.equal(viewerRecoveryDeny.ok, false);
if (!viewerRecoveryDeny.ok) {
  assert.equal(viewerRecoveryDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const assigneeRoleRecoveryDeny = authorizeLoadedJobIssueAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.RECOVERY_REQUEST,
  {
    id: "issue-1",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(assigneeRoleRecoveryDeny.ok, false);
if (!assigneeRoleRecoveryDeny.ok) {
  assert.equal(assigneeRoleRecoveryDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const fieldInternalRecoveryDeny = authorizeLoadedJobIssueAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.RECOVERY_SUGGEST,
  { id: "issue-1", relationshipScope: "assignment" },
);
assert.equal(fieldInternalRecoveryDeny.ok, false);
if (!fieldInternalRecoveryDeny.ok) {
  assert.equal(fieldInternalRecoveryDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const visitBase: LoadedJobVisitAuthorizationResource = {
  id: "visit-1",
  assignedUserId: "field-1",
  relationshipScope: "assignment",
  collaboratorGrants: [{ permissionsJson: { completeVisits: true } }],
};

assert.equal(
  authorizeLoadedJobVisitAction(actor(StaffRole.FIELD), STAFF_ACTIONS.VISIT_COMPLETE, visitBase).ok,
  true,
  "assigned FIELD should complete visit",
);

const fieldUnassignedVisitDeny = authorizeLoadedJobVisitAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.VISIT_COMPLETE,
  {
    ...visitBase,
    assignedUserId: "someone-else",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(fieldUnassignedVisitDeny.ok, false);
if (!fieldUnassignedVisitDeny.ok) {
  assert.equal(fieldUnassignedVisitDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const visitScheduleActions = [
  STAFF_ACTIONS.VISIT_SCHEDULE_CREATE,
  STAFF_ACTIONS.VISIT_SCHEDULE_UPDATE,
] as const;

for (const action of visitScheduleActions) {
  const fieldScheduleDeny = authorizeLoadedJobVisitAction(actor(StaffRole.FIELD), action, visitBase);
  assert.equal(fieldScheduleDeny.ok, false, `FIELD should be denied ${action}`);
  if (!fieldScheduleDeny.ok) {
    assert.equal(fieldScheduleDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const fieldCancelDeny = authorizeLoadedJobVisitAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.VISIT_CANCEL,
  visitBase,
);
assert.equal(fieldCancelDeny.ok, false);
if (!fieldCancelDeny.ok) {
  assert.equal(fieldCancelDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const subWithoutGrantVisitDeny = authorizeLoadedJobVisitAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.VISIT_COMPLETE,
  {
    ...visitBase,
    assignedUserId: "sub-1",
    relationshipScope: "collaborator",
    collaboratorGrants: [],
  },
);
assert.equal(subWithoutGrantVisitDeny.ok, false);
if (!subWithoutGrantVisitDeny.ok) {
  assert.equal(subWithoutGrantVisitDeny.code, AUTHZ_DENY_CODES.COLLABORATOR_GRANT_REQUIRED);
}

const subUnassignedVisitDeny = authorizeLoadedJobVisitAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.VISIT_COMPLETE,
  {
    ...visitBase,
    assignedUserId: "someone-else",
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { completeVisits: true } }],
  },
);
assert.equal(subUnassignedVisitDeny.ok, false);
if (!subUnassignedVisitDeny.ok) {
  assert.equal(subUnassignedVisitDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

assert.equal(
  authorizeLoadedJobVisitAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    STAFF_ACTIONS.VISIT_COMPLETE,
    {
      ...visitBase,
      assignedUserId: "sub-1",
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { completeVisits: true } }],
    },
  ).ok,
  true,
  "SUB with grant and assigned visit should complete visit",
);

const visitManagementActions = [
  STAFF_ACTIONS.VISIT_SCHEDULE_CREATE,
  STAFF_ACTIONS.VISIT_SCHEDULE_UPDATE,
  STAFF_ACTIONS.VISIT_CANCEL,
] as const;

for (const action of visitManagementActions) {
  const subManagementDeny = authorizeLoadedJobVisitAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    action,
    {
      ...visitBase,
      assignedUserId: "sub-1",
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { completeVisits: true } }],
    },
  );
  assert.equal(subManagementDeny.ok, false, `SUB should be denied ${action}`);
  if (!subManagementDeny.ok) {
    assert.equal(subManagementDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  for (const action of visitManagementActions) {
    assert.equal(
      authorizeLoadedJobVisitAction(actor(role), action, { id: "visit-1" }).ok,
      true,
      `${role} should be allowed for ${action}`,
    );
  }
}

const viewerVisitDeny = authorizeLoadedJobVisitAction(
  actor(StaffRole.VIEWER),
  STAFF_ACTIONS.VISIT_COMPLETE,
  visitBase,
);
assert.equal(viewerVisitDeny.ok, false);
if (!viewerVisitDeny.ok) {
  assert.equal(viewerVisitDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const assigneeRoleVisitDeny = authorizeLoadedJobVisitAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.VISIT_COMPLETE,
  {
    ...visitBase,
    assignedUserId: "someone-else",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(assigneeRoleVisitDeny.ok, false);
if (!assigneeRoleVisitDeny.ok) {
  assert.equal(assigneeRoleVisitDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const fieldInternalVisitDeny = authorizeLoadedJobVisitAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.VISIT_COMPLETE,
  visitBase,
  { includesInternalNotes: true },
);
assert.equal(fieldInternalVisitDeny.ok, false);
if (!fieldInternalVisitDeny.ok) {
  assert.equal(fieldInternalVisitDeny.code, AUTHZ_DENY_CODES.INTERNAL_CONTENT_DENIED);
}

const taskCoordinationBase: LoadedTaskAuthorizationResource = {
  ...taskBase,
  relationshipScope: "assignment",
  collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
};

const taskCoordinationActions = [
  STAFF_ACTIONS.TASK_SCHEDULE_UPDATE,
  STAFF_ACTIONS.TASK_DEADLINE_UPDATE,
] as const;

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  for (const action of taskCoordinationActions) {
    assert.equal(
      authorizeLoadedTaskAction(actor(role), action, taskCoordinationBase).ok,
      true,
      `${role} should be allowed for ${action}`,
    );
  }
}

for (const action of taskCoordinationActions) {
  const fieldAssignedScheduleDeny = authorizeLoadedTaskAction(
    actor(StaffRole.FIELD),
    action,
    taskCoordinationBase,
  );
  assert.equal(fieldAssignedScheduleDeny.ok, false, `assigned FIELD should be denied ${action}`);
  if (!fieldAssignedScheduleDeny.ok) {
    assert.equal(fieldAssignedScheduleDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const fieldUnassignedScheduleDeny = authorizeLoadedTaskAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.TASK_SCHEDULE_UPDATE,
  {
    ...taskCoordinationBase,
    assignedUserId: "someone-else",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(fieldUnassignedScheduleDeny.ok, false);
if (!fieldUnassignedScheduleDeny.ok) {
  assert.equal(fieldUnassignedScheduleDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

for (const action of taskCoordinationActions) {
  const subScheduleDeny = authorizeLoadedTaskAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    action,
    {
      ...taskCoordinationBase,
      assignedUserId: "sub-1",
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
    },
  );
  assert.equal(subScheduleDeny.ok, false, `SUB should be denied ${action}`);
  if (!subScheduleDeny.ok) {
    assert.equal(subScheduleDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const viewerScheduleDeny = authorizeLoadedTaskAction(
  actor(StaffRole.VIEWER),
  STAFF_ACTIONS.TASK_SCHEDULE_UPDATE,
  taskCoordinationBase,
);
assert.equal(viewerScheduleDeny.ok, false);
if (!viewerScheduleDeny.ok) {
  assert.equal(viewerScheduleDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const assigneeRoleScheduleDeny = authorizeLoadedTaskAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.TASK_DEADLINE_UPDATE,
  {
    ...taskCoordinationBase,
    assignedUserId: "someone-else",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(assigneeRoleScheduleDeny.ok, false);
if (!assigneeRoleScheduleDeny.ok) {
  assert.equal(assigneeRoleScheduleDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

assert.equal(
  authorizeLoadedTaskAction(actor(StaffRole.FIELD), STAFF_ACTIONS.TASK_COMPLETE, taskCoordinationBase).ok,
  true,
  "assigned FIELD task execution should remain allowed",
);

const scheduleEventBase = { id: "event-1" };

const scheduleEventOfficeActions = [
  STAFF_ACTIONS.SCHEDULE_EVENT_CONFIRM,
  STAFF_ACTIONS.SCHEDULE_EVENT_CANCEL,
  STAFF_ACTIONS.SCHEDULE_EVENT_UPDATE,
  STAFF_ACTIONS.SCHEDULE_EVENT_LINK_TASKS,
  STAFF_ACTIONS.SCHEDULE_EVENT_UNLINK_TASKS,
] as const;

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  for (const action of scheduleEventOfficeActions) {
    assert.equal(
      authorizeLoadedJobScheduleEventAction(actor(role), action, scheduleEventBase).ok,
      true,
      `${role} should be allowed for ${action}`,
    );
  }

  assert.equal(
    authorizeLoadedScheduleBlockAction(actor(role), STAFF_ACTIONS.SCHEDULE_BLOCK_UPSERT, { id: "new" }).ok,
    true,
    `${role} should be allowed to upsert schedule blocks`,
  );
}

assert.equal(
  authorizeLoadedJobScheduleEventAction(
    actor(StaffRole.OFFICE),
    STAFF_ACTIONS.SCHEDULE_EVENT_CREATE,
    scheduleEventBase,
  ).ok,
  false,
  "SCHEDULE_EVENT_CREATE must be job-scoped, not event-scoped",
);

for (const action of scheduleEventOfficeActions) {
  const fieldScheduleEventDeny = authorizeLoadedJobScheduleEventAction(
    actor(StaffRole.FIELD),
    action,
    scheduleEventBase,
  );
  assert.equal(fieldScheduleEventDeny.ok, false, `FIELD should be denied ${action}`);
  if (!fieldScheduleEventDeny.ok) {
    assert.equal(fieldScheduleEventDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const fieldAssignedScheduleEventDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.SCHEDULE_EVENT_CONFIRM,
  scheduleEventBase,
);
assert.equal(fieldAssignedScheduleEventDeny.ok, false);

for (const action of [...scheduleEventOfficeActions, STAFF_ACTIONS.SCHEDULE_BLOCK_UPSERT] as const) {
  const subScheduleDeny =
    action === STAFF_ACTIONS.SCHEDULE_BLOCK_UPSERT
      ? authorizeLoadedScheduleBlockAction(actor(StaffRole.SUBCONTRACTOR, "sub-1"), action, { id: "new" })
      : authorizeLoadedJobScheduleEventAction(actor(StaffRole.SUBCONTRACTOR, "sub-1"), action, scheduleEventBase);
  assert.equal(subScheduleDeny.ok, false, `SUB should be denied ${action}`);
  if (!subScheduleDeny.ok) {
    assert.equal(subScheduleDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const viewerScheduleEventDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.VIEWER),
  STAFF_ACTIONS.SCHEDULE_EVENT_CANCEL,
  scheduleEventBase,
);
assert.equal(viewerScheduleEventDeny.ok, false);
if (!viewerScheduleEventDeny.ok) {
  assert.equal(viewerScheduleEventDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const assigneeRoleScheduleEventDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.SCHEDULE_EVENT_LINK_TASKS,
  scheduleEventBase,
);
assert.equal(assigneeRoleScheduleEventDeny.ok, false);
if (!assigneeRoleScheduleEventDeny.ok) {
  assert.equal(assigneeRoleScheduleEventDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const fieldEventLeadUpdateDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.SCHEDULE_EVENT_UPDATE,
  {
    id: "event-1",
    leadUserId: "field-1",
    relationshipScope: "assignment",
  },
);
assert.equal(fieldEventLeadUpdateDeny.ok, false);
if (!fieldEventLeadUpdateDeny.ok) {
  assert.equal(fieldEventLeadUpdateDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const subEventLeadUpdateDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.SCHEDULE_EVENT_UPDATE,
  {
    id: "event-1",
    leadUserId: "sub-1",
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { completeScheduleEvents: true } }],
  },
);
assert.equal(subEventLeadUpdateDeny.ok, false);
if (!subEventLeadUpdateDeny.ok) {
  assert.equal(subEventLeadUpdateDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const scheduleEventCompleteBase: LoadedJobScheduleEventAuthorizationResource = {
  id: "event-1",
  leadUserId: "field-1",
  relationshipScope: "assignment",
  collaboratorGrants: [{ permissionsJson: { completeScheduleEvents: true } }],
};

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  assert.equal(
    authorizeLoadedJobScheduleEventAction(actor(role), STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE, scheduleEventCompleteBase).ok,
    true,
    `${role} should complete schedule events`,
  );
}

assert.equal(
  authorizeLoadedJobScheduleEventAction(
    actor(StaffRole.FIELD),
    STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE,
    scheduleEventCompleteBase,
  ).ok,
  true,
  "FIELD event lead should complete schedule event",
);

const fieldNotEventLeadCompleteDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE,
  {
    ...scheduleEventCompleteBase,
    leadUserId: "someone-else",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(fieldNotEventLeadCompleteDeny.ok, false);
if (!fieldNotEventLeadCompleteDeny.ok) {
  assert.equal(fieldNotEventLeadCompleteDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const subWithoutGrantCompleteDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE,
  {
    ...scheduleEventCompleteBase,
    leadUserId: "sub-1",
    relationshipScope: "collaborator",
    collaboratorGrants: [],
  },
);
assert.equal(subWithoutGrantCompleteDeny.ok, false);
if (!subWithoutGrantCompleteDeny.ok) {
  assert.equal(subWithoutGrantCompleteDeny.code, AUTHZ_DENY_CODES.COLLABORATOR_GRANT_REQUIRED);
}

const subUnassignedCompleteDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE,
  {
    ...scheduleEventCompleteBase,
    leadUserId: "someone-else",
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { completeScheduleEvents: true } }],
  },
);
assert.equal(subUnassignedCompleteDeny.ok, false);
if (!subUnassignedCompleteDeny.ok) {
  assert.equal(subUnassignedCompleteDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const subMissingPermissionCompleteDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.SUBCONTRACTOR, "sub-1"),
  STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE,
  {
    ...scheduleEventCompleteBase,
    leadUserId: "sub-1",
    relationshipScope: "collaborator",
    collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
  },
);
assert.equal(subMissingPermissionCompleteDeny.ok, false);
if (!subMissingPermissionCompleteDeny.ok) {
  assert.equal(subMissingPermissionCompleteDeny.code, AUTHZ_DENY_CODES.COLLABORATOR_PERMISSION_DENIED);
}

assert.equal(
  authorizeLoadedJobScheduleEventAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE,
    {
      ...scheduleEventCompleteBase,
      leadUserId: "sub-1",
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { completeScheduleEvents: true } }],
    },
  ).ok,
  true,
  "SUB with explicit completeScheduleEvents permission and event lead should complete",
);

const completeRescheduleMetadataDeny = authorizeLoadedJobScheduleEventAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.SCHEDULE_EVENT_COMPLETE,
  scheduleEventCompleteBase,
  { scheduledStartAt: new Date() },
);
assert.equal(completeRescheduleMetadataDeny.ok, false);
if (!completeRescheduleMetadataDeny.ok) {
  assert.equal(completeRescheduleMetadataDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const leadVisitAssignedBase: LoadedLeadVisitRequestAuthorizationResource = {
  id: "lead-visit-1",
  assignedUserId: "field-1",
  relationshipScope: "assignment",
};

const leadVisitAssignedFieldActions = [
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CONFIRM,
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_RESCHEDULE,
  STAFF_ACTIONS.LEAD_VISIT_COMPLETE,
  STAFF_ACTIONS.LEAD_VISIT_NO_SHOW,
  STAFF_ACTIONS.LEAD_VISIT_OUTCOME_UPDATE,
  STAFF_ACTIONS.LEAD_VISIT_ACCESS_DETAILS_UPDATE,
] as const;

const leadVisitAllActions = [
  ...leadVisitAssignedFieldActions,
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CANCEL,
] as const;

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  for (const action of leadVisitAllActions) {
    assert.equal(
      authorizeLoadedLeadVisitRequestAction(actor(role), action, leadVisitAssignedBase).ok,
      true,
      `${role} should be allowed for ${action}`,
    );
  }
}

for (const action of leadVisitAssignedFieldActions) {
  assert.equal(
    authorizeLoadedLeadVisitRequestAction(actor(StaffRole.FIELD), action, leadVisitAssignedBase).ok,
    true,
    `assigned FIELD should be allowed for ${action}`,
  );
}

const fieldAssignedCancelDeny = authorizeLoadedLeadVisitRequestAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CANCEL,
  leadVisitAssignedBase,
);
assert.equal(fieldAssignedCancelDeny.ok, false);
if (!fieldAssignedCancelDeny.ok) {
  assert.equal(fieldAssignedCancelDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

for (const action of leadVisitAllActions) {
  const fieldUnassignedDeny = authorizeLoadedLeadVisitRequestAction(
    actor(StaffRole.FIELD),
    action,
    {
      ...leadVisitAssignedBase,
      assignedUserId: "someone-else",
      assigneeRole: StaffRole.FIELD,
      relationshipScope: "org",
    },
  );
  assert.equal(fieldUnassignedDeny.ok, false, `unassigned FIELD should be denied ${action}`);
  if (!fieldUnassignedDeny.ok) {
    assert.equal(
      fieldUnassignedDeny.code,
      action === STAFF_ACTIONS.LEAD_VISIT_SCHEDULE_CANCEL
        ? AUTHZ_DENY_CODES.ROLE_DENIED
        : AUTHZ_DENY_CODES.NOT_ASSIGNED,
    );
  }
}

for (const action of leadVisitAllActions) {
  const subDeny = authorizeLoadedLeadVisitRequestAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    action,
    {
      ...leadVisitAssignedBase,
      assignedUserId: "sub-1",
      relationshipScope: "assignment",
    },
  );
  assert.equal(subDeny.ok, false, `SUB should be denied ${action}`);
  if (!subDeny.ok) {
    assert.equal(subDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

for (const action of leadVisitAllActions) {
  const viewerDeny = authorizeLoadedLeadVisitRequestAction(
    actor(StaffRole.VIEWER),
    action,
    leadVisitAssignedBase,
  );
  assert.equal(viewerDeny.ok, false, `VIEWER should be denied ${action}`);
  if (!viewerDeny.ok) {
    assert.equal(viewerDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const assigneeRoleLeadVisitDeny = authorizeLoadedLeadVisitRequestAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.LEAD_VISIT_COMPLETE,
  {
    ...leadVisitAssignedBase,
    assignedUserId: "someone-else",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(assigneeRoleLeadVisitDeny.ok, false);
if (!assigneeRoleLeadVisitDeny.ok) {
  assert.equal(assigneeRoleLeadVisitDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const jobLifecycleBase: LoadedJobAuthorizationResource = {
  id: "job-1",
  relationshipScope: "org",
};

const jobLifecycleActions = [
  STAFF_ACTIONS.JOB_ARCHIVE,
  STAFF_ACTIONS.JOB_SCHEDULE_CLEANUP_CONFIRM,
] as const;

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  for (const action of jobLifecycleActions) {
    assert.equal(
      authorizeLoadedJobLifecycleAction(actor(role), action, jobLifecycleBase).ok,
      true,
      `${role} should be allowed for ${action}`,
    );
  }
}

for (const action of jobLifecycleActions) {
  const fieldDeny = authorizeLoadedJobLifecycleAction(
    actor(StaffRole.FIELD),
    action,
    {
      ...jobLifecycleBase,
      relationshipScope: "assignment",
    },
  );
  assert.equal(fieldDeny.ok, false, `FIELD should be denied ${action}`);
  if (!fieldDeny.ok) {
    assert.equal(fieldDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }

  const subDeny = authorizeLoadedJobLifecycleAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    action,
    {
      ...jobLifecycleBase,
      relationshipScope: "collaborator",
      collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
      hasAssignedWork: true,
    },
  );
  assert.equal(subDeny.ok, false, `SUB should be denied ${action}`);
  if (!subDeny.ok) {
    assert.equal(subDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }

  const viewerDeny = authorizeLoadedJobLifecycleAction(
    actor(StaffRole.VIEWER),
    action,
    jobLifecycleBase,
  );
  assert.equal(viewerDeny.ok, false, `VIEWER should be denied ${action}`);
  if (!viewerDeny.ok) {
    assert.equal(viewerDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const assigneeRoleArchiveDeny = authorizeLoadedJobLifecycleAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.JOB_ARCHIVE,
  {
    ...jobLifecycleBase,
    relationshipScope: "assignment",
    hasAssignedWork: true,
  },
);
assert.equal(assigneeRoleArchiveDeny.ok, false);
if (!assigneeRoleArchiveDeny.ok) {
  assert.equal(assigneeRoleArchiveDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  assert.match(assigneeRoleArchiveDeny.message, /archive jobs/i);
}

const assigneeRoleCleanupDeny = authorizeLoadedJobLifecycleAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.JOB_SCHEDULE_CLEANUP_CONFIRM,
  {
    ...jobLifecycleBase,
    relationshipScope: "assignment",
    hasAssignedWork: true,
  },
);
assert.equal(assigneeRoleCleanupDeny.ok, false);
if (!assigneeRoleCleanupDeny.ok) {
  assert.equal(assigneeRoleCleanupDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  assert.match(assigneeRoleCleanupDeny.message, /schedule cleanup/i);
}

const workPackageJobBase: LoadedJobAuthorizationResource = {
  id: "job-1",
  relationshipScope: "org",
};

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  assert.equal(
    authorizeLoadedWorkPackageAction(
      actor(role),
      STAFF_ACTIONS.WORK_PACKAGE_CREATE,
      workPackageJobBase,
      "Job",
    ).ok,
    true,
    `${role} should be allowed for WORK_PACKAGE_CREATE`,
  );

  assert.equal(
    authorizeLoadedTaskAction(actor(role), STAFF_ACTIONS.WORK_PACKAGE_TASK_ASSIGN, {
      ...taskBase,
      relationshipScope: "org",
    }).ok,
    true,
    `${role} should be allowed for WORK_PACKAGE_TASK_ASSIGN`,
  );
}

const workPackageActions = [
  STAFF_ACTIONS.WORK_PACKAGE_CREATE,
  STAFF_ACTIONS.WORK_PACKAGE_TASK_ASSIGN,
] as const;

for (const action of workPackageActions) {
  const fieldDeny =
    action === STAFF_ACTIONS.WORK_PACKAGE_CREATE
      ? authorizeLoadedWorkPackageAction(
          actor(StaffRole.FIELD),
          action,
          {
            ...workPackageJobBase,
            relationshipScope: "assignment",
            hasAssignedWork: true,
          },
          "Job",
        )
      : authorizeLoadedTaskAction(actor(StaffRole.FIELD), action, {
          ...taskBase,
          assignedUserId: "field-1",
          assigneeRole: StaffRole.FIELD,
          relationshipScope: "assignment",
        });

  assert.equal(fieldDeny.ok, false, `FIELD should be denied ${action}`);
  if (!fieldDeny.ok) {
    assert.equal(fieldDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }

  const subDeny =
    action === STAFF_ACTIONS.WORK_PACKAGE_CREATE
      ? authorizeLoadedWorkPackageAction(
          actor(StaffRole.SUBCONTRACTOR, "sub-1"),
          action,
          {
            ...workPackageJobBase,
            relationshipScope: "collaborator",
            collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
            hasAssignedWork: true,
          },
          "Job",
        )
      : authorizeLoadedTaskAction(actor(StaffRole.SUBCONTRACTOR, "sub-1"), action, {
          ...taskBase,
          assignedUserId: "sub-1",
          relationshipScope: "collaborator",
          collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
        });

  assert.equal(subDeny.ok, false, `SUB should be denied ${action}`);
  if (!subDeny.ok) {
    assert.equal(subDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }

  const viewerDeny =
    action === STAFF_ACTIONS.WORK_PACKAGE_CREATE
      ? authorizeLoadedWorkPackageAction(
          actor(StaffRole.VIEWER),
          action,
          workPackageJobBase,
          "Job",
        )
      : authorizeLoadedTaskAction(actor(StaffRole.VIEWER), action, {
          ...taskBase,
          relationshipScope: "org",
        });

  assert.equal(viewerDeny.ok, false, `VIEWER should be denied ${action}`);
  if (!viewerDeny.ok) {
    assert.equal(viewerDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const assigneeRoleWorkPackageAssignDeny = authorizeLoadedTaskAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.WORK_PACKAGE_TASK_ASSIGN,
  {
    ...taskBase,
    assignedUserId: "someone-else",
    assigneeRole: StaffRole.FIELD,
    relationshipScope: "org",
  },
);
assert.equal(assigneeRoleWorkPackageAssignDeny.ok, false);
if (!assigneeRoleWorkPackageAssignDeny.ok) {
  assert.equal(assigneeRoleWorkPackageAssignDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  assert.match(assigneeRoleWorkPackageAssignDeny.message, /work package/i);
}

assert.equal(
  authorizeLoadedTaskAction(actor(StaffRole.FIELD), STAFF_ACTIONS.TASK_COMPLETE, {
    ...taskBase,
    relationshipScope: "assignment",
  }).ok,
  true,
  "assigned FIELD task completion should remain allowed",
);

const fieldHoldJobBase: LoadedJobAuthorizationResource = {
  id: "job-1",
  relationshipScope: "assignment",
};

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  assert.equal(
    authorizeLoadedJobFieldHoldAction(actor(role), STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE, {
      ...fieldHoldJobBase,
      relationshipScope: "org",
    }).ok,
    true,
    `${role} should be allowed for JOB_FIELD_HOLD_CREATE`,
  );

  assert.equal(
    authorizeLoadedJobFieldHoldCancelAction(
      actor(role),
      STAFF_ACTIONS.JOB_FIELD_HOLD_CANCEL,
      { id: "hold-task-1" },
      "org",
    ).ok,
    true,
    `${role} should be allowed for JOB_FIELD_HOLD_CANCEL`,
  );
}

assert.equal(
  authorizeLoadedJobFieldHoldAction(
    actor(StaffRole.FIELD),
    STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE,
    fieldHoldJobBase,
  ).ok,
  true,
  "assigned FIELD should create field holds",
);

assert.equal(
  authorizeLoadedJobFieldHoldCancelAction(
    actor(StaffRole.FIELD),
    STAFF_ACTIONS.JOB_FIELD_HOLD_CANCEL,
    { id: "hold-task-1" },
    "assignment",
  ).ok,
  true,
  "job-assigned FIELD should cancel field holds",
);

const unassignedFieldHoldCreate = authorizeLoadedJobFieldHoldAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE,
  { ...fieldHoldJobBase, relationshipScope: "org" },
);
assert.equal(unassignedFieldHoldCreate.ok, false);
if (!unassignedFieldHoldCreate.ok) {
  assert.equal(unassignedFieldHoldCreate.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const unassignedFieldHoldCancel = authorizeLoadedJobFieldHoldCancelAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.JOB_FIELD_HOLD_CANCEL,
  { id: "hold-task-1" },
  "org",
);
assert.equal(unassignedFieldHoldCancel.ok, false);
if (!unassignedFieldHoldCancel.ok) {
  assert.equal(unassignedFieldHoldCancel.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

for (const action of [
  STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE,
  STAFF_ACTIONS.JOB_FIELD_HOLD_CANCEL,
] as const) {
  const subDeny =
    action === STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE
      ? authorizeLoadedJobFieldHoldAction(
          actor(StaffRole.SUBCONTRACTOR, "sub-1"),
          action,
          {
            ...fieldHoldJobBase,
            relationshipScope: "collaborator",
            collaboratorGrants: [{ permissionsJson: { updateAssignedTasks: true } }],
            hasAssignedWork: true,
          },
        )
      : authorizeLoadedJobFieldHoldCancelAction(
          actor(StaffRole.SUBCONTRACTOR, "sub-1"),
          action,
          { id: "hold-task-1" },
          "assignment",
        );

  assert.equal(subDeny.ok, false, `SUB should be denied ${action}`);
  if (!subDeny.ok) {
    assert.equal(subDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }

  const viewerDeny =
    action === STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE
      ? authorizeLoadedJobFieldHoldAction(
          actor(StaffRole.VIEWER),
          action,
          { ...fieldHoldJobBase, relationshipScope: "org" },
        )
      : authorizeLoadedJobFieldHoldCancelAction(
          actor(StaffRole.VIEWER),
          action,
          { id: "hold-task-1" },
          "org",
        );

  assert.equal(viewerDeny.ok, false, `VIEWER should be denied ${action}`);
  if (!viewerDeny.ok) {
    assert.equal(viewerDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const assigneeRoleFieldHoldCreateDeny = authorizeLoadedJobFieldHoldAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.JOB_FIELD_HOLD_CREATE,
  {
    ...fieldHoldJobBase,
    relationshipScope: "org",
    hasAssignedWork: true,
  },
);
assert.equal(assigneeRoleFieldHoldCreateDeny.ok, false);
if (!assigneeRoleFieldHoldCreateDeny.ok) {
  assert.equal(assigneeRoleFieldHoldCreateDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const assigneeRoleFieldHoldCancelDeny = authorizeLoadedJobFieldHoldCancelAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.JOB_FIELD_HOLD_CANCEL,
  { id: "hold-task-1" },
  "org",
);
assert.equal(assigneeRoleFieldHoldCancelDeny.ok, false);
if (!assigneeRoleFieldHoldCancelDeny.ok) {
  assert.equal(assigneeRoleFieldHoldCancelDeny.code, AUTHZ_DENY_CODES.NOT_ASSIGNED);
}

const paymentJobBase = { id: "job-1" };
const paymentRequirementBase = { id: "req-1" };

const paymentActions = [
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_MARK_PAID,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_WAIVE,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CANCEL,
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_PORTAL_LINK_UPDATE,
] as const;

for (const role of [StaffRole.OFFICE, StaffRole.ADMIN, StaffRole.OWNER] as const) {
  for (const action of paymentActions) {
    const resource =
      action === STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE
        ? paymentJobBase
        : paymentRequirementBase;
    const resourceLabel =
      action === STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE ? "Job" : "Payment requirement";

    assert.equal(
      authorizeLoadedJobPaymentAction(actor(role), action, resource, resourceLabel).ok,
      true,
      `${role} should be allowed for ${action}`,
    );
  }
}

for (const action of paymentActions) {
  const resource =
    action === STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE
      ? paymentJobBase
      : paymentRequirementBase;
  const resourceLabel =
    action === STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE ? "Job" : "Payment requirement";

  const fieldDeny = authorizeLoadedJobPaymentAction(
    actor(StaffRole.FIELD),
    action,
    resource,
    resourceLabel,
  );
  assert.equal(fieldDeny.ok, false, `FIELD should be denied ${action}`);
  if (!fieldDeny.ok) {
    assert.equal(fieldDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
    assert.match(fieldDeny.message, /payment requirement/i);
  }

  const subDeny = authorizeLoadedJobPaymentAction(
    actor(StaffRole.SUBCONTRACTOR, "sub-1"),
    action,
    resource,
    resourceLabel,
  );
  assert.equal(subDeny.ok, false, `SUB should be denied ${action}`);
  if (!subDeny.ok) {
    assert.equal(subDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }

  const viewerDeny = authorizeLoadedJobPaymentAction(
    actor(StaffRole.VIEWER),
    action,
    resource,
    resourceLabel,
  );
  assert.equal(viewerDeny.ok, false, `VIEWER should be denied ${action}`);
  if (!viewerDeny.ok) {
    assert.equal(viewerDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
  }
}

const fieldAssignedPaymentCreateDeny = authorizeLoadedJobPaymentAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE,
  paymentJobBase,
  "Job",
);
assert.equal(fieldAssignedPaymentCreateDeny.ok, false);
if (!fieldAssignedPaymentCreateDeny.ok) {
  assert.equal(fieldAssignedPaymentCreateDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const assigneeRolePaymentDeny = authorizeLoadedJobPaymentAction(
  actor(StaffRole.FIELD),
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_MARK_PAID,
  paymentRequirementBase,
  "Payment requirement",
);
assert.equal(assigneeRolePaymentDeny.ok, false);
if (!assigneeRolePaymentDeny.ok) {
  assert.equal(assigneeRolePaymentDeny.code, AUTHZ_DENY_CODES.ROLE_DENIED);
}

const missingPaymentRequirement = authorizeLoadedJobPaymentAction(
  actor(StaffRole.OFFICE),
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_MARK_PAID,
  null,
  "Payment requirement",
);
assert.equal(missingPaymentRequirement.ok, false);
if (!missingPaymentRequirement.ok) {
  assert.equal(missingPaymentRequirement.code, AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND);
  assert.match(missingPaymentRequirement.message, /payment requirement/i);
}

const missingPaymentJob = authorizeLoadedJobPaymentAction(
  actor(StaffRole.OFFICE),
  STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE,
  null,
  "Job",
);
assert.equal(missingPaymentJob.ok, false);
if (!missingPaymentJob.ok) {
  assert.equal(missingPaymentJob.code, AUTHZ_DENY_CODES.RESOURCE_NOT_FOUND);
}

console.log("staff-actions.test.ts passed");

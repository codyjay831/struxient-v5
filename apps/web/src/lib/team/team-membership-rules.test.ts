import assert from "node:assert/strict";
import { StaffRole } from "@prisma/client";
import {
  canActorChangeTargetRole,
  canActorRemoveTarget,
  countOwners,
  getMembershipEditRestriction,
  isManageableMemberRole,
} from "./team-membership-rules";

const soleOwnerActor = {
  actorUserId: "user_owner",
  actorRole: StaffRole.OWNER,
  ownerCount: 1,
};

const adminActor = {
  actorUserId: "user_admin",
  actorRole: StaffRole.ADMIN,
  ownerCount: 1,
};

const ownerTarget = {
  membershipId: "m1",
  userId: "user_owner",
  role: StaffRole.OWNER,
};

const fieldTarget = {
  membershipId: "m2",
  userId: "user_field",
  role: StaffRole.FIELD,
};

assert.equal(isManageableMemberRole(StaffRole.FIELD), true);
assert.equal(isManageableMemberRole(StaffRole.OWNER), false);
assert.equal(countOwners([{ role: StaffRole.OWNER }, { role: StaffRole.FIELD }]), 1);

assert.equal(
  canActorChangeTargetRole(soleOwnerActor, ownerTarget, StaffRole.ADMIN),
  "Cannot demote the only Owner in this organization.",
);
assert.equal(
  canActorRemoveTarget(soleOwnerActor, ownerTarget),
  "Cannot remove the only Owner in this organization.",
);
assert.equal(
  canActorChangeTargetRole(adminActor, ownerTarget, StaffRole.ADMIN),
  "Admins cannot modify Owner memberships.",
);
assert.equal(
  canActorRemoveTarget(adminActor, ownerTarget),
  "Admins cannot modify Owner memberships.",
);
assert.equal(canActorChangeTargetRole(soleOwnerActor, fieldTarget, StaffRole.OFFICE), null);
assert.equal(canActorRemoveTarget(soleOwnerActor, fieldTarget), null);
assert.equal(getMembershipEditRestriction(adminActor, ownerTarget), "Admins cannot modify Owner memberships.");
assert.equal(
  getMembershipEditRestriction(soleOwnerActor, ownerTarget),
  "The only Owner cannot be demoted or removed here.",
);

console.log("team-membership-rules.test.ts passed");

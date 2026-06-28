import assert from "node:assert/strict";
import { StaffRole } from "@prisma/client";
import {
  denyUnlessCanReadCommercial,
  denyUnlessCanManageCommercial,
  denyUnlessCanManageOrgSettings,
  denyUnlessCanMutate,
} from "./staff-authz";
import {
  createPublicAttachmentUploadToken,
  verifyPublicAttachmentUploadToken,
} from "./attachment-upload-token";

process.env.AUTH_SECRET = "test-secret-with-enough-length-for-hmac-signing";

assert.equal(denyUnlessCanMutate(StaffRole.VIEWER), "You do not have permission to perform this action.");
assert.equal(denyUnlessCanMutate(StaffRole.SUBCONTRACTOR), "You do not have permission to perform this action.");
assert.equal(denyUnlessCanMutate(StaffRole.FIELD), null);
assert.equal(denyUnlessCanMutate(StaffRole.OWNER), null);

assert.equal(denyUnlessCanManageCommercial(StaffRole.FIELD), "You do not have permission to perform this action.");
assert.equal(denyUnlessCanManageCommercial(StaffRole.VIEWER), "You do not have permission to perform this action.");
assert.equal(denyUnlessCanReadCommercial(StaffRole.VIEWER), null);
assert.equal(denyUnlessCanManageCommercial(StaffRole.OFFICE), null);

assert.equal(denyUnlessCanManageOrgSettings(StaffRole.ADMIN), null);
assert.equal(denyUnlessCanManageOrgSettings(StaffRole.OFFICE), "You do not have permission to change organization settings.");

const token = createPublicAttachmentUploadToken({
  attachmentId: "att_1",
  organizationId: "org_1",
  clientIp: "127.0.0.1",
});

assert.equal(
  verifyPublicAttachmentUploadToken({
    token,
    attachmentId: "att_1",
    organizationId: "org_1",
    clientIp: "127.0.0.1",
  }),
  true,
);

assert.equal(
  verifyPublicAttachmentUploadToken({
    token,
    attachmentId: "att_2",
    organizationId: "org_1",
    clientIp: "127.0.0.1",
  }),
  false,
);

console.log("staff-authz.test.ts passed");

-- Drop legacy org-level request type options; canonical source is IntakeFormDefinition.triageRules.
ALTER TABLE "PublicRequestSettings" DROP COLUMN "requestTypeOptionsJson";

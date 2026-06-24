-- Flag legacy ACCEPTED change orders with execution-relevant scope-only deltas for office review.
WITH co_ops AS (
  SELECT
    co.id,
    co."executionDeltaJson",
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(co."executionDeltaJson"->'operations') op
      WHERE op->>'type' = 'ADD_SCOPE_ITEM'
        AND COALESCE((op->'payload'->>'executionRelevant')::boolean, true) = true
    ) AS has_exec_add,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(co."executionDeltaJson"->'operations') op
      WHERE op->>'type' = 'ADD_TASK'
    ) AS has_add_task
  FROM "ChangeOrder" co
  WHERE co."status" = 'ACCEPTED'
    AND co."applicationStatus" = 'NOT_APPLIED'
    AND co."executionDeltaJson" IS NOT NULL
    AND COALESCE(co."executionDeltaJson"->'meta'->>'legacyScopeReconciliation', 'false') = 'true'
)
UPDATE "ChangeOrder" co
SET
  "applicationStatus" = 'NEEDS_EXECUTION_REVIEW',
  "lastApplyErrorJson" = jsonb_build_object(
    'classification', 'LEGACY_BACKFILL',
    'errors', jsonb_build_array(
      'Legacy accepted Change Order has execution-relevant scope without task coverage. Office review required before apply.'
    ),
    'recordedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  "lastApplyAttemptAt" = CURRENT_TIMESTAMP
FROM co_ops
WHERE co.id = co_ops.id
  AND co_ops.has_exec_add = true
  AND co_ops.has_add_task = false;

# AI Metering Research & Rollout

> Status: instrumentation shipped; collect production/staging samples before flipping `AI_METERING_SHADOW=0`.

## Goal

Bill customer AI allowance from **real Gemini token counts**, track **internal API cost** separately, and treat **one user action** as **one metered event** (including multi-call flows like site details).

## Architecture

- **`gemini-generate-content.ts`** — parse `usageMetadata` from SDK + REST responses
- **`AiTokenAccumulator`** — sum sub-calls per user action
- **`runMeteredAiFeature`** — wraps all server actions / API routes
- **`AI_METERING_SHADOW=1`** — logs tokens + `estimatedCostCents` without incrementing `usedUnits` / beta `usedAiUnits`
- **`estimatedCostCents`** — internal margin view (`billing-ai-cost-config.ts`); not customer-facing

## Feature tiers (for allowance calibration)

| Tier | Features | Typical sub-calls |
|------|----------|-------------------|
| **Small** | Tag suggest, tag merges, context assess | 1 SDK call |
| **Medium** | Clarifications, payment schedule, execution review | 1 SDK call |
| **Large** | Scope suggestions, execution plans (quote + library), site details | 1–5 calls (site details: grounded + extraction + 0–3 APN retries) |

## Unit formula (current)

- `billableUnits = max(1, ceil((inputTokens + outputTokens) / 1000))`
- Min-unit policy: **decide after shadow data** (see open decisions)

## Shadow mode

```bash
# apps/web/.env
AI_METERING_SHADOW=1   # log only (default for rollout)
AI_METERING_SHADOW=0   # enforce allowance counters
```

While shadow is on, inspect `AiUsageLog`:

- `inputTokens`, `outputTokens` — real provider counts when available
- `estimatedCostCents` — internal cost estimate
- `responsePayload.shadowBillableUnits` — what would be charged
- `responsePayload.legacyBillableUnits` — old char-proxy/min-1 comparison (site details)
- `responsePayload.callBreakdown` — per sub-call tokens (site details)

## SQL snippets for analysis

```sql
-- Per-feature p50/p95 tokens (last 7 days)
SELECT
  feature,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS p50_tokens,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS p95_tokens,
  COUNT(*) AS n
FROM "AiUsageLog"
WHERE status = 'success' AND created_at > NOW() - INTERVAL '7 days'
GROUP BY feature
ORDER BY p95_tokens DESC;

-- Shadow vs legacy gap (site details)
SELECT
  id,
  billable_units,
  (response_payload->>'shadowBillableUnits')::int AS shadow_units,
  (response_payload->>'legacyBillableUnits')::int AS legacy_units
FROM "AiUsageLog"
WHERE feature = 'site_details_research' AND status = 'success'
ORDER BY created_at DESC
LIMIT 50;
```

## Open decisions (fill after sample collection)

1. **Min unit policy** — keep min 1, tiered mins (small/med/large), or pure proportional?
2. **Allowance calibration** — are 500 paid / 50 beta units fair at p95 active-org usage?
3. **Overage margin** — does `AI_OVERAGE_PRICE_PER_UNIT_CENTS=2` cover p95 `estimatedCostCents` + margin?
4. **Beta hard cap** — block at 0 remaining (current); partial last call not allowed
5. **Enforcement flip** — recommend ≥100 shadow logs per tier with token metadata present on ≥95% of calls

## Enforcement checklist

- [ ] Shadow samples collected per tier
- [ ] p50/p95 documented in this file
- [ ] Min-unit decision recorded
- [ ] Set `AI_METERING_SHADOW=0` in staging, verify counters move
- [ ] Beta org exhaust test (50 units)
- [ ] Run `npx tsx scripts/billing/bill-ai-overages.ts` dry-run against shadow projections

## Overage ops

Manual billing script (unchanged):

```bash
cd apps/web
npx tsx scripts/billing/bill-ai-overages.ts
# optional: --organizationId=org_xxx
```

## Tests

```bash
cd apps/web
node --import tsx --test src/lib/billing/ai-metering.test.ts src/lib/billing/billing.test.ts
```

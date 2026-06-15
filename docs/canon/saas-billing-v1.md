# Struxient SaaS Billing (Canon)

> **Status:** Launch billing baseline — one plan, card-required trial, AI usage overages.

## Product model

| Item | Default |
|------|---------|
| Plan | Struxient Pro (single tier) |
| Trial | 14 days, card required |
| Base price | Configured via `STRUXIENT_BASE_PRICE_ID` (display default $99/mo) |
| Included AI | 500 billable units / billing period |
| Overage | $0.02 per unit, invoiced via Stripe invoice items at period end |
| Billable unit | 1 unit ≈ 1,000 provider tokens (min 1 unit per request) |

## Entitlement rules

- **Product access:** `TRIALING`, `ACTIVE`, or `PAST_DUE` subscription statuses.
- **AI access:** `TRIALING` or `ACTIVE` only. `PAST_DUE` blocks AI until payment is updated.
- **Non-AI features:** Remain available when AI allowance is exhausted; only AI actions are metered or blocked.
- **Dev/local:** When Stripe is not configured, billing is bypassed and all features are available.

## Onboarding funnel

1. Signup (company + owner + terms)
2. Business profile (skippable)
3. Stripe Checkout trial
4. Workstation

## Configuration env vars

See [apps/web/.env.example](../../apps/web/.env.example): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRUXIENT_BASE_PRICE_ID`, `STRUXIENT_TRIAL_DAYS`, `AI_INCLUDED_UNITS`, `AI_OVERAGE_PRICE_PER_UNIT_CENTS`.

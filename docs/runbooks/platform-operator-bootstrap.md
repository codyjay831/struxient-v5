# Platform operator bootstrap runbook

Use this runbook to grant the first platform operator access in a new environment.

## Prerequisites

- A real `User` row must already exist (sign up through the normal auth flow).
- Schema migration `platform_access_and_audit` must be applied.
- Do **not** add `PlatformAccess` to `prisma/seed.ts`.

## Local development

1. Sign up or log in as the intended operator.
2. From `apps/web`, run:

```bash
npx tsx scripts/platform/bootstrap-operator.ts --email you@example.com --confirm
```

3. Verify:
   - One active `PlatformAccess` row for the user (`revokedAt` is null).
   - One `PlatformAuditEvent` with action `platform.access.bootstrapped`, `actorType=SYSTEM`, `actorUserId=null`.

4. Sign in and open `/platform`.

## Production / preview

1. Ensure `NODE_ENV=production` (preview deployments count).
2. Set `ALLOW_PLATFORM_BOOTSTRAP=1` for the one-time bootstrap command only.
3. Run the same script against the target database.
4. Unset `ALLOW_PLATFORM_BOOTSTRAP` after success.
5. Optional: set `PLATFORM_BOOTSTRAP_DISABLED=1` to block accidental re-runs.

## Idempotency

- Active access: script exits successfully without creating duplicates.
- Revoked access: re-run with `--force` to clear `revokedAt` and write a new bootstrap audit event in one transaction.

## Failure modes

| Symptom | Likely cause |
|---------|----------------|
| `No user found for email` | User has not signed up yet |
| `Refusing to run without --confirm` | Missing safety flag |
| `Production bootstrap requires ALLOW_PLATFORM_BOOTSTRAP=1` | Prod guard active |
| `/platform` redirects to login | No session |
| `/platform` shows access denied | No active `PlatformAccess` row |

## Security notes

- Bootstrap is script-only in MVP; there is no runtime grant endpoint.
- Platform authority is separate from contractor `Membership`.
- Development contractor fallback never grants platform access.

See also: [`docs/canon/platform-operations-canon.md`](../canon/platform-operations-canon.md).

# Release deployment checklist

Use this checklist for production releases after code, build, or database recovery work.

## Pre-release checks

1. Confirm the branch and commit intended for release.
2. From `apps/web`, run:

```bash
npm run lint
npm run typecheck
```

3. Confirm production runtime typechecking remains clean before pushing.

## Deploy

1. Push the approved commit to `main`.
2. Confirm the Vercel production build completes successfully.
3. If the local Windows build is blocked only by the known Prisma DLL lock, do not treat that as an app code failure.

## Production database migrations

Run Prisma commands only against the intended production database connection.

1. Check production migration state:

```bash
npx prisma migrate status
```

2. If migrations are pending, apply them with:

```bash
npx prisma migrate deploy
```

3. Never run these commands against production:

```bash
npx prisma migrate dev
npx prisma migrate reset
```

## Post-deploy verification

1. Verify critical routes:
   - `/workstation`
   - Quote signing route, if available
   - Job page, if available
2. Check fresh Vercel runtime logs after deploy.
3. Confirm there are no new post-deploy runtime errors.
4. Record the released commit, migration result, verified routes, and log check outcome in the release notes or operator handoff.

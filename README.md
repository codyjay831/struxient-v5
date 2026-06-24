# Struxient v5

Product canon and architecture live in [`docs/canon/`](docs/canon/). Implementation risks, gaps, and follow-ups are tracked in [`docs/build-concerns-risks-and-gaps.md`](docs/build-concerns-risks-and-gaps.md).

## Application (`apps/web/`)

The runnable Next.js app is in **`apps/web/`** (production-shaped UI per canon **I22**).

```bash
cd apps/web
npm install
npm run dev
```

From the repo root you can also run `npm run dev` (same as `npm --prefix apps/web run dev`).

Open [http://localhost:3001](http://localhost:3001). Production build:

```bash
cd apps/web
npm run build
```

Or from the repo root: `npm run build`.

### Docker

From the repository root (requires [Docker](https://docs.docker.com/get-docker/) with Compose V2):

From the **`Struxient_v5` repository root** (so Compose picks up `name: struxient-v5` and you see **`struxient-v5-web`** in Docker Desktop):

```bash
docker compose up --build -d
```

Or: `npm run docker:up` (same thing; runs detached). Logs: `npm run docker:logs`. Stop: `npm run docker:down`.

**Troubleshooting:** If the container exits immediately or the page does not load, check `docker compose logs web`. If port **3001** is already in use, change the left side of `ports` in `docker-compose.yml` (e.g. `3002:3000`).

Then open [http://localhost:3001](http://localhost:3001) (host **3001** → container **3000**). The image uses Next.js **standalone** output ([`docker/web/Dockerfile`](docker/web/Dockerfile), build context `apps/web/`, `apps/web/next.config.ts`).

If nothing named **struxient-v5** appears under Containers, the stack was never started from this folder—or Docker Desktop is on another machine/context.

### Local database (Prisma, optional)

For host-side Prisma (`apps/web/`) against the compose **db** service only:

1. From the repo root: `docker compose up -d db` (starts **`struxient-v5-db`** on host **5432** per `docker-compose.yml`).
2. In `apps/web/`: copy `.env.example` to `.env` (same `DATABASE_URL` shape as compose for local dev).
3. From `apps/web/`: `npx prisma migrate dev` (apply pending migrations; initial migration is `20260505175844_init_org_customer`).
4. After migrations that add Prisma enums or fields: `npx prisma generate`, then restart the dev server (`npm run dev`). A stale client can leave new enum values undefined at runtime until you regenerate and restart.
5. From `apps/web/`: `npx prisma db seed` (development seed data only; safe to re-run).
6. Validate: `npx prisma generate`, `npm run lint`, `npm run build` (from `apps/web/`, or use root `npm run lint` / `npm run build`).

Do not point `DATABASE_URL` at other projects’ Postgres instances. Rebuild the **`web`** image if you need the Dockerized app on port **3001** to match the latest source.

## Repository layout

| Path | Contents |
|------|----------|
| `docs/canon/` | Authoritative product and architecture canon |
| `docs/build-concerns-risks-and-gaps.md` | Concerns, risks, and expansion items for engineering |
| `apps/web/` | Next.js App Router application |
| `docker-compose.yml` | Builds and runs the `web` service in production mode; app on host port **3001** |
| `docker/web/Dockerfile` | Multi-stage production image for the Next.js app |

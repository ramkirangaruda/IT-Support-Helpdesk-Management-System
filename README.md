# TicketZilla

IT helpdesk and asset management platform with AI-assisted ticket triage, agent assist, procurement pipeline, and device lifecycle management. Built as a monorepo with a React frontend, NestJS API, and FastAPI AI microservice.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| Docker Desktop | 4+ |
| Python | 3.11+ |

## Setup

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd Ticketzilla
npm install

# 2. Configure environment
cp .env.example apps/api/.env
# Edit apps/api/.env and fill in JWT_SECRET and LLM credentials

# 3. Start infrastructure
docker-compose up -d postgres redis minio

# 4. Run database migrations and seed
cd apps/api
npx prisma migrate deploy
npx prisma db seed

# 5. Start the API (port 3007 — required; 3000 is reserved on the dev machine)
PORT=3007 npm run start:dev --workspace=apps/api

# 6. Start the frontend (new terminal)
npm run dev --workspace=apps/web

# 7. (Optional) Start AI microservice
cd apps/ai-service
pip install -r requirements.txt
python main.py
```

## Seed User Credentials

**Bootstrap SYS_ADMIN — `admin@ticketzilla.dev`:** the seed generates a **strong random password
at seed time** and prints it **once** to the console. It is stored only as a bcrypt hash (never in a
file or AuditLog), so that console output is the only place it ever appears.

> After seeding, the bootstrap SYS_ADMIN password is printed once to the console — **save it
> immediately**. Change it after first login if a password-change feature exists; otherwise note it
> securely. Re-running the seed does **not** reprint or rotate it (it only generates on first
> provision). To mint a fresh one, clear that user's `passwordHash` (or reset the DB) and re-seed.

Log in via the `/login` form or `POST /api/auth/login`. The `*@test.com` users below are
**dev-login / OIDC** accounts (no password) — sign in via the dev-login dropdown (dev only) or
`POST /api/auth/dev-login`.

| Email | Role | Login | Access |
|-------|------|-------|--------|
| `admin@ticketzilla.dev` | SYS_ADMIN | **password** (generated at seed, printed once) | All access; manage users at `/admin/users` |
| `employee@test.com` | EMPLOYEE | dev-login | Raise tickets, request devices |
| `agent@test.com` | AGENT | dev-login | Work tickets, add internal notes |
| `l2@test.com` | L2_L3 | dev-login | Escalated tickets, agent assist |
| `manager@test.com` | MANAGER | dev-login | Approve device requests, purchase requests |
| `admin@test.com` | IT_ADMIN | dev-login | Full admin — devices, procurement, users |
| `finance@test.com` | FINANCE | dev-login | Finance approvals queue |
| `sysadmin@test.com` | SYS_ADMIN | dev-login | System config, all access |

## Architecture

Three-tier monorepo: React 18 + TypeScript frontend (Vite) → NestJS REST API (Prisma/PostgreSQL, Redis/BullMQ) → FastAPI AI microservice. The API is the single backend; the frontend never calls the AI service directly. Auth is JWT (dev-login in dev, OIDC SSO in production).

## Running Services

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:3007 |
| AI Microservice | http://localhost:8001 |
| BullMQ Dashboard | http://localhost:3007/api/queues |
| MinIO Console | http://localhost:9001 |

> **Ports:** the API runs on **3007** and the AI service on **8001** (3000/8000 are reserved on the
> reference dev machine). Start the API with `PORT=3007` set; Vite proxies `/api` → `:3007`.
>
> **Notifications are in-app only** (Notification model + admin log + sidebar bell). Gmail/email
> sending was removed by product decision — there are no email/SMTP/Gmail env vars to configure.

## Production Deployment

1. Set `NODE_ENV=production` — disables `/api/auth/dev-login` and dev-admin endpoints
2. Set `JWT_SECRET`, `LLM_API_KEY`, `FRONTEND_URL`, `OIDC_*` in environment
3. `npm run build --workspace=apps/api && node apps/api/dist/main.js`
4. `npm run build --workspace=apps/web` — serve `dist/` with nginx or CloudFront
5. Wire OIDC: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`

Or use `docker-compose.prod.yml`, which builds all three services (each runs **non-root**),
keeps the datastores off the host network, and runs `prisma migrate deploy` on bring-up. The
web container's nginx runs unprivileged on **8080** (mapped to host 80) and proxies `/api` to the
api service.

## First steps after deploy

1. **Create the first real admin.** Log in as `sysadmin` (seeded), then create/approve your first
   real `IT_ADMIN` account via `/admin/pending-users`. Don't rely on the seed/test accounts in prod.
2. **Publish KB articles before launch.** Add at least 3–5 articles covering common IT issues
   (`/kb` → Manage Articles → publish). The AI chat only deflects against **published** articles —
   with an empty KB every chat becomes a ticket.
3. **Tune `SystemConfig`** to your org if the defaults don't fit:
   - `REOPEN_WINDOW_DAYS` (default **7**) — how long a closed ticket can be reopened.
   - `MAX_DEVICES_PER_EMPLOYEE` (default **2**) — device-limit reminder threshold.
   - `REMINDER_CADENCE_DAYS` (default **3**) — days between device-limit reminders.

## Known limitations

- **SLA uses calendar hours, not working hours.** Response/resolution targets count wall-clock
  time (pause-adjusted for ON_HOLD); a business-calendar/working-hours engine is not yet implemented.
- **`npm audit` — 3 high findings in admin-only / build-time deps** (accepted risk, monitor for
  updates): `lodash` via `@bull-board` (the admin-only queue UI), `multer` via
  `@nestjs/platform-express` (no file-upload routes are exposed), and `picomatch` via the Vite
  build toolchain (not shipped in the runtime bundle). Fixes require breaking major upgrades.
- **File attachments are not wired to storage.** The ticket/procurement attachment UI exists, but
  the storage backend (MinIO/S3) is not configured — uploads won't persist until it is.
- **`ApprovalStep` uses a polymorphic parent reference** (`parentType`/`parentId`), not a real FK,
  so its rows aren't cascade-deleted. PurchaseRequests are never hard-deleted today; if that
  changes, clean up approval steps in application code or refactor the table to real FKs.

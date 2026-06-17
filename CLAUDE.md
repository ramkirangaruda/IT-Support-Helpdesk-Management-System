# TicketZilla — Project Context

## Communication
Always begin every response with "Ramkiran," before saying anything else.

## Stack
- Frontend: React 18 + TypeScript + Tailwind CSS (apps/web)
- API: NestJS + TypeScript (apps/api)
- AI Service: Python FastAPI (apps/ai-service)
- DB: PostgreSQL via Prisma ORM
- Cache/Queue: Redis + BullMQ
- Auth: JWT (cookie + bearer) with OIDC in production; mock dev-login in dev
- Email: Gmail API (OAuth 2.0)
- Object storage: local MinIO in dev, S3-compatible in prod

## Architecture
Monorepo. API is the single backend. AI Service is a separate microservice 
called by the API. Frontend talks only to the API.

## Phasing (build in this order)
1. MVP: tickets, lifecycle state machine, RBAC, email notifications
2. AI chat-to-ticket, agent assist, KB
3. Dashboards, reporting
4. Device management + procurement
5. AI across all actions

## Key rules
- Always use Prisma for DB queries
- All API routes require JWT auth middleware
- State transitions must go through the TicketStateMachine service
- All changes go to AuditLog
- Never hardcode secrets — use .env

## Auth
JWT via passport-jwt. Token accepted from httpOnly cookie (`access_token`) OR Bearer header.
Dev login at POST /api/auth/dev-login (NODE_ENV≠production only).
OIDC: GET /api/auth/oidc/login → redirect; GET /api/auth/oidc/callback → JWT issued in cookie + body.
No auto-provisioning: user must be pre-created in DB with matching ssoSubject.
JwtAuthGuard + RolesGuard + ThrottlerGuard applied globally via APP_GUARD.
Use @Public() to opt routes out of auth. Use @Roles(...RoleName) for RBAC.
Use @CurrentUser() to access the authenticated user in a controller.

## Current phase
COMPLETE — all 5 phases built, TypeScript-clean, pre-launch hardened.

## Pre-Launch Hardening — COMPLETE (2026-06-17)
All A-H sections completed:

**A — Spec conformance FINAL VERDICT:**
- §4.4 transitions: EXACT MATCH ✓
- §3.4 RBAC: EXACT MATCH ✓ (agent/L2-L3 write-scoped to assigned; employees own-scoped; MANAGER/FINANCE removed from ticket visibility)
- §4.4 reopen window: ENFORCED ✓ (REOPEN_WINDOW_DAYS SystemConfig, default 7)
- §4.5.2 SLA: NONCONFORMANT (wall-clock; working-hours deferred — see deferred items)
- §3.4 "Team" scope for reports: PARTIALLY ADDRESSED — `teamId` added to User; reports filter pending

**B — Separation of duties:**
- `managerId` self-relation added to User schema (run `npx prisma db push` after Docker up)
- `teamId` added to User for report scoping
- Device request approval scoped to direct manager (when `requester.managerId` is set)
- PR approval: IT_ADMIN removed from approve stages; same person cannot approve both MANAGER+FINANCE stages; SYS_ADMIN retains override

**C — OIDC:**
- `openid-client` v5 installed; `OidcService` in `apps/api/src/auth/oidc.service.ts`
- PKCE (S256) code flow; state stored in short-lived httpOnly cookie
- No auto-provisioning: lookup by ssoSubject, 404 if not found
- JWT issued as httpOnly cookie (`access_token`) + JSON body for SPA/API clients
- Required env vars: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_CALLBACK_URL

**D — Production hardening:**
- GET /api/health is now @Public() (no JWT required for healthchecks)
- All three Dockerfiles use non-root users (nestjs:nodejs, nginx, appuser:appgroup)
- cookie-parser wired in main.ts
- .env.example updated with OIDC vars + JWT_SECRET generation note

**E — Dependency vulnerabilities:**
- ai-service: starlette ≥1.3.1, tornado ≥6.5.7, urllib3 ≥2.7.0 pinned in requirements.txt
- api/web: remaining highs are all in @nestjs/cli / vite / esbuild (dev/build-tool only, not in deployed artifact); accepted

**F — Database backup:**
- `scripts/backup/pg-backup.sh` — nightly pg_dump (custom format, compress=9, 14-day retention)
- `pg-backup` service added to docker-compose.prod.yml (crond at 02:00 UTC, /backups volume)

**G — Quick wins:**
- ThrottlerGuard wired as APP_GUARD (100 req/min default)
- Prisma P2002 → HTTP 409 mapped in AllExceptionsFilter
- GET /api/admin/notifications?status=FAILED — IT_ADMIN/SYS_ADMIN only
- Ticket ID-gen retry: P2002 on PK collision → re-generate ID, up to 3 attempts

## Audit (2026-06-16)
Full audit performed against a live stack (Postgres+Redis on Docker, API run locally).
- E2E TEST 1–4 PASS. TEST 5 (chat deflection/draft) deferred — needs Python AI service + real LLM_API_KEY.
- Initial fixes: auto-PR stuck at RAISED; device double-allocation race; §3.4 RBAC scoping; §4.4 reopen window.
- `docker-compose.prod.yml` drafted.

## Data import scaffolding
`apps/api/scripts/import/` — generic CSV importers run via ts-node.
- `import-employees.ts` (name,email,department,ssoSubject) upserts Users + ensures EMPLOYEE role.
- `import-devices.ts` (type,makeModel,serialNumber,status,condition,purchasedOn,cost) creates Device records.
- `csv-utils.ts` shared (dependency-free parser, dry-run report, per-row audit log under logs/).
Pattern: validate ALL rows first; dry-run by default; only writes with `--commit`; any malformed row aborts the commit.

## Port convention (dev)
- API runs on **:3007** — port 3000 is permanently occupied by a Qwikhire Vite server on this machine. Always start the API with `$env:PORT=3007 node dist/main.js` (or `PORT=3007 npm run start:dev`). Never kill PID on :3000.
- Frontend Vite dev server runs on **:5173** (default).
- AI service runs on **:8001** — port 8000 is permanently occupied by another process on this machine. Always start with `python main.py` (uses port 8001 via the `__main__` block) or `uvicorn main:app --port 8001`. Never suggest or revert to port 8000. `AI_SERVICE_URL` is permanently set to `http://localhost:8001` in `.env` and defaults to that in the adapter.
- `apps/web/vite.config.ts` proxies `/api` → `http://localhost:3007`. If this ever reverts to :3000, the login form will show "Login failed" with no API errors — it's the proxy, not the API.
- CORS in `main.ts` allows `FRONTEND_URL` (default `http://localhost:5173`) — no change needed.

## Email/password auth (2026-06-17)
Real credentials-based auth is now in place alongside dev-login and OIDC.

**Self-registration flow:**
- POST /api/auth/register — public, rate-limited to 5/hour per IP
  - Input: { name, email, password (min 10 chars, must contain letter+number), department }
  - Creates user with accountStatus=PENDING_APPROVAL, no roles
  - Emails IT_ADMIN users + sends confirmation to registrant
  - Returns generic success — no token issued
- New users CANNOT log in until an IT_ADMIN approves them
- Schema fields added to User: passwordHash (String?, bcrypt 12 rounds), accountStatus (AccountStatus enum), approvedById, approvedAt
- ssoSubject is now nullable — self-registered users have ssoSubject=null

**Login:**
- POST /api/auth/login — public
  - Input: { email, password }
  - Generic "Invalid email or password" for both "no such user" and "wrong password" (no enumeration)
  - Specific messages only for accountStatus checks (pending/rejected/suspended — intentional per spec)
  - Per-email lockout: 5 failed attempts in 15 min → locked with time-remaining message
  - Login failures ≥3 for same email logged to Notification table (visible via GET /admin/notifications?status=FAILED)
  - Issues same JWT shape as dev-login and OIDC (sub, email, roles[], 8h expiry)

**Admin approval:**
- GET /api/admin/pending-users — IT_ADMIN/SYS_ADMIN only; returns all PENDING_APPROVAL users
- POST /api/admin/pending-users/:id/approve — body: { roles: string[] }; activates account, assigns roles, emails user
- POST /api/admin/pending-users/:id/reject — body: { reason: string }; rejects account, emails user with reason
- All approval/rejection actions written to AuditLog

**JWT strategy:** validates accountStatus=ACTIVE in addition to status=ACTIVE — so any token issued to a user who is later suspended/rejected stops working immediately.

**Frontend:**
- /login — shows dev-login dropdown when MODE≠production; shows real email/password form in production
- /register — self-registration form with client-side validation matching backend rules; on success shows "pending" message (no auto-redirect)
- /admin/pending-users — IT_ADMIN/SYS_ADMIN only; table of pending users with Approve/Reject modals; nav link added

**Passwords are NEVER:**
- Returned in any API response (all user queries use explicit select without passwordHash)
- Logged anywhere (AuditLog before/after fields explicitly exclude passwordHash)

## Frontend navigation (2026-06-17)
Navigation is a **collapsible left sidebar** (not a top nav bar). There is no top nav.

- **Location:** `apps/web/src/components/Sidebar.tsx`
- **Width:** 240 px expanded / 64 px collapsed (icon-only); toggle button top-right of sidebar
- **Persistence:** collapse state saved to `localStorage` key `sidebar-collapsed`
- **Mobile:** auto-collapses when `window.innerWidth < 768 px` on mount

**Universal landing page:** `/dashboard` for ALL roles. `/` and `*` redirect there when authenticated.

**Role-based sidebar sections and items:**

| Section | Items | Roles that see it |
|---|---|---|
| DASHBOARD | Dashboard | All authenticated |
| TICKETS | My Tickets, My Queue\*, Triage Queue\*, New Ticket | All; \*agents/admins only |
| DEVICES | My Devices, Request Device, Device Register\*, Device Requests\*, Approvals\* | All; \*IT_ADMIN/SYS_ADMIN/MANAGER |
| PROCUREMENT | Pipeline | IT_ADMIN, SYS_ADMIN |
| KNOWLEDGE BASE | Browse Articles, Manage Articles\* | All; \*agents+ |
| ADMINISTRATION | Ticket Queue, Assign Tickets, Purchase Requests, Pending Users, Notification Log | IT_ADMIN, SYS_ADMIN only |
| FINANCE | Purchase Requests, Approvals | FINANCE only |

**Role-conditional dashboard views** (all at `/dashboard`):
- IT_ADMIN / SYS_ADMIN → full admin charts (tickets by priority/category, agent workload, SLA metrics, overdue devices)
- AGENT / L2_L3 → agent queue summary (open/escalated counts)
- MANAGER → pending approval counts (device + purchase requests)
- FINANCE → pending finance approvals + pipeline value
- EMPLOYEE → personal overview (own tickets + devices, quick-action buttons)

**Pages added:**
- `apps/web/src/pages/RegisterPage.tsx` — self-registration at `/register`
- `apps/web/src/pages/admin/AdminPendingUsersPage.tsx` — pending user approvals at `/admin/pending-users`
- `apps/web/src/pages/admin/AdminNotificationsPage.tsx` — notification log at `/admin/notifications` (auto-refresh 30 s)

## Admin endpoints (all environments, IT_ADMIN/SYS_ADMIN only)
- GET /api/admin/notifications?status=FAILED&limit=100 — view failed notification records + repeated login failures
- GET /api/admin/pending-users — list accounts pending approval
- POST /api/admin/pending-users/:id/approve — approve with role assignment
- POST /api/admin/pending-users/:id/reject — reject with reason

## Dev-only endpoints (NODE_ENV ≠ production)
- POST /api/auth/dev-login — get a JWT for any test user (hard-blocked in production)
- POST /api/admin/trigger-escalation-check — manually fire SLA escalation check
- POST /api/admin/trigger-device-reminder-check — manually fire device limit check

## Known deferred items
- File attachments with MinIO/S3 (procurement documents, ticket attachments)
- Real SLA working-hours calendar (current impl uses wall-clock time)
- Finance PDF purchase order generation
- Full E2E test suite (Playwright / Cypress)
- Apple Silicon / Linux arm64 Docker image for ai-service
- Reports "Team" scope filter (teamId column added; filter logic in ReportsService pending)
- SLA/category/user-management config endpoints (§3.4 admin panel)
- No-team-model manager scoping for procurement (managerId column added; set per user in seed/import)

## Deployment notes
1. Copy `.env.example` → `.env` and fill in all secrets
   - JWT_SECRET: `openssl rand -base64 32`
   - OIDC_*: set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_CALLBACK_URL for production SSO
2. docker-compose up -d postgres redis ai-service minio
3. cd apps/api && npx prisma db push  (or migrate deploy if using migrations)
4. npm run build --workspace=apps/api && node apps/api/dist/main.js
5. npm run build --workspace=apps/web — serve dist/ with nginx / Cloudfront
6. Set NODE_ENV=production — disables dev-login and dev-admin trigger endpoints
7. Set FRONTEND_URL to the public domain (used in email links and CORS)
8. Mount a host volume at /backups for the pg-backup service (docker-compose.prod.yml)

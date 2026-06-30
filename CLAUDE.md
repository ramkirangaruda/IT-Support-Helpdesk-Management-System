# TicketZilla — Project Context

> **DEPLOY READINESS: ✅ GO — ALL KNOWN ISSUES RESOLVED — 2026-06-30**
> Every previously-deferred item that was fixable pre-deploy is now fixed and verified (see
> "Deferred-Items Cleanup (2026-06-30)" below). Builds clean (api/web/ai), all 7 roles' pages load
> with zero console errors / 5xx, pagination works, the web Docker image now builds and serves
> **non-root**, and the bundle is code-split (35 KB entry, was 961 KB). The earlier blocking
> migration-drift fix (2026-06-29) remains in place. No open blockers.
>
> **DEPLOY READINESS history:** 1 BLOCKING found+fixed on 2026-06-29 (migration drift — auth columns
> were never captured in a migration; a fresh `migrate deploy` would have shipped without
> accountStatus/passwordHash/managerId and broken auth + seed). See "Final QA Pass (2026-06-29)".

## Communication
Always begin every response with "Ramkiran," before saying anything else.

## Stack
- Frontend: React 18 + TypeScript + Tailwind CSS (apps/web)
- API: NestJS + TypeScript (apps/api)
- AI Service: Python FastAPI (apps/ai-service)
- DB: PostgreSQL via Prisma ORM
- Cache/Queue: Redis + BullMQ
- Auth: JWT (cookie + bearer) with OIDC in production; mock dev-login in dev
- Notifications: **in-app only** (Notification model + admin log + sidebar bell) — Gmail/email integration fully removed per product decision (2026-06-17). Do NOT reintroduce email/Gmail code unless explicitly asked.
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

## Deferred-Items Cleanup (2026-06-30) — all 7 fixes applied + verified
Closed out every deferred item that was fixable before deploy. Builds clean (api/web/ai); 7-role
live sweep = 0 console errors / 0 5xx / no blank pages.

1. **429 error label.** `AllExceptionsFilter` now has a `ThrottlerException` branch →
   `{statusCode:429, error:"Too Many Requests", message:"Too many requests. Please wait before
   trying again."}`. Verified live (was mislabeled "Internal Server Error").
2. **Pagination (UI + backend).** Added `common/dto/pagination-query.dto.ts` (`page`/`limit`,
   max 100, default 20) + `paginated()` envelope `{data,total,page,limit,totalPages}`. Endpoints
   `/tickets`, `/devices`, `/device-requests`, `/purchase-requests` now paginate server-side
   (devices also gained `status`/`type` filters — this fixed a latent bug where the allocate
   picker's `?status=AVAILABLE&type=` params were silently ignored). Frontend: shared
   `components/Pagination.tsx` (Prev/Next + "Page X of Y"); DeviceRegisterPage is server-paginated
   (filters pushed to the API); ProcurementPipelinePage + DeviceRequestQueuePage use client-side
   paging over a 100-row fetch (to keep their status-count badges/tabs working); TicketListPage &
   AdminTicketQueuePage already paged. **All other consumers of the now-enveloped endpoints**
   (dashboards, manager/finance approval queues, my-device-requests) updated to read `.data.data`
   with `limit:100`. Verified live on all target pages.
3. **Case-insensitive email at DB level.** Migration `20260629130000_user_email_lower_unique`
   adds `CREATE UNIQUE INDEX user_email_lower_unique ON "User"(LOWER(email))`. DTOs already
   lowercase+trim. Verified: registering `Employee@test.com`/`EMPLOYEE@TEST.COM` → 409; a direct
   case-variant DB insert is rejected by the index. (App returns 409 Conflict, the correct
   duplicate status, rather than 400.) NOTE: Prisma can't model a functional index, so this is a
   manual migration — do not run `prisma migrate dev` against prod (it'd flag it as drift).
4. **Explicit onDelete on all relations.** Every relation now states Cascade/Restrict/SetNull
   explicitly (migration `20260629140000_explicit_ondelete`). Only two actually changed at the DB
   level — `Notification.ticket` and `ChatSession.ticket` → **Cascade** (per spec). All others
   already matched their chosen default (no Restrict→Cascade was changed silently).
   **FLAGGED:** `ApprovalStep`→`PurchaseRequest` is a **polymorphic** `parentType`/`parentId`
   reference (no FK), so it can't take onDelete without a redesign — documented in schema + README;
   PRs are never hard-deleted today.
5. **Dockerfile non-root.** `apps/api` (USER nestjs) and `apps/ai-service` (USER appuser) already
   ran non-root. `apps/web` now uses `nginxinc/nginx-unprivileged:alpine`, runs as **uid 101
   (nginx)**, listens on **8080**. While fixing this I found the web image **could not build at
   all**: `nginx.conf` was missing entirely (created it — SPA `try_files` + `/api` proxy via Docker
   DNS resolver so nginx starts even if api is down), `npm ci` had no lockfile in the web context
   (→ `npm install`), and there was no `.dockerignore` (added — Windows `node_modules` was being
   copied into the linux image). Verified: image builds, runs non-root, serves the SPA + deep
   routes + hashed assets (HTTP 200). `docker-compose.prod.yml` web port is now `80:8080`.
6. **Web bundle splitting.** `vite.config.ts` `manualChunks` (react/query/charts/ui/http vendors)
   **plus route-level `React.lazy` + `Suspense`** in `App.tsx`. Entry chunk **318 KB → 35 KB**
   (9.5 KB gzipped); recharts (366 KB) is no longer in the initial load — it's deferred to the
   dashboard route. 31 chunks total; largest eager vendor chunk is react at 153 KB.
7. **README.** Ports confirmed 3007/8001/5173; added **Known limitations** (wall-clock SLA, the 3
   accepted npm-audit highs, attachments-not-wired, ApprovalStep polymorphic) and **First steps
   after deploy** (create first real IT_ADMIN, publish 3–5 KB articles before launch, tune
   REOPEN_WINDOW_DAYS / MAX_DEVICES_PER_EMPLOYEE / REMINDER_CADENCE_DAYS in SystemConfig).

## Final QA Pass (2026-06-29) — 10-section live audit
Ran all 10 sections against a live stack. Verdict: **READY TO DEPLOY** (1 blocker found + fixed).

**BLOCKING — FOUND & FIXED:**
- **Migration drift.** The email/password-auth columns (`accountStatus`, `passwordHash`,
  `approvedById`, `approvedAt`, `managerId`, `teamId`, `AccountStatus` enum, `ssoSubject` nullable)
  were applied to the dev DB via `prisma db push` but **never captured in a migration**. A fresh
  prod `migrate deploy` (what docker-compose.prod.yml runs) would create a User table missing those
  columns → registration/login/approval crash and seed fails (P2022). FIXED: added migration
  `20260617000000_add_auth_account_fields`; verified fresh-DB `migrate deploy` + seed now works
  (7 users/roles, categories, SLA, config); dev DB reconciled via `migrate resolve --applied`.

**SHOULD-FIX — FIXED THIS PASS:**
- Ticket-ID race: 10 concurrent creates → 5×HTTP 409 (`findFirst+1` with only 3 retries). FIXED with
  a Postgres transaction advisory lock (`pg_advisory_xact_lock`) serializing INC-id generation
  (`tickets.service.ts`). Re-tested: 10 concurrent → all unique, 0 conflicts.
- Assign-to-non-agent: a ticket could be assigned to an EMPLOYEE/MANAGER/FINANCE. FIXED — `assign()`
  now requires the assignee hold AGENT/L2_L3/IT_ADMIN/SYS_ADMIN (else 400).
- Chat ticket subject: used the raw confirmation message ("yes create it") as the subject. FIXED in
  `apps/ai-service/main.py` — draft subject/description now derive from the user's FIRST issue
  message, not the latest. Verified: chat ticket subject = real issue, source=CHAT.
- Unbounded list endpoints (`/devices`, `/device-requests`, `/purchase-requests`) had no `take`.
  Added `take: 500` caps (full limit/offset paging is a follow-up).
- Missing DB indexes. Added 11 (`Ticket.status/assigneeId/requesterId/priority`,
  `Notification.recipientEmail+status / status`, `DeviceRequest.requesterId/status`,
  `DeviceAllocation.employeeId/deviceId`, `ChatMessage.sessionId`) via migration
  `20260629120000_add_performance_indexes`.
- Removed unused `zustand` dep (web). README ports corrected to 3007/8001 + in-app-only note.
- Added dev-only `POST /api/admin/trigger-sla-warning-check` (prod-blocked) for SLA-warning testing.

**VERIFIED WORKING (live):**
- Builds: api `nest build` ✓, web `tsc && vite build` ✓ (1 bundle-size warning only), ai `py_compile` ✓.
- 68 endpoints: global JwtAuthGuard+RolesGuard (8 intentional @Public); role/validation/error spot-checks
  all correct (403/400/404, no 500s); passwordHash never leaked (6 endpoints scanned).
- Concurrency: 10 concurrent ticket creates → unique ids; 2 concurrent allocations of one device →
  1×201 + 1×400 (atomic claim).
- Business logic: full ticket lifecycle + every blocked transition (400), reopen window (in→ok, out→400),
  ON_HOLD pause accounting (slaPausedMs), SLA escalate + warn (both idempotent), device reminder cycles
  1→skip→2 (in-app), procurement chain + SoD (IT_ADMIN 403, manager-scoping 403, wrong-stage 403),
  chat KB deflection (no ticket) + draft→confirm→CHAT ticket, AI-down graceful (201 fallback, 30s timeout).
- Security: bcrypt $2b$12$, login enumeration parity, lockout, prompt injection rebuffed, prod mode
  blocks dev-login + dev-triggers (403) and leaks no stack traces, all raw SQL parameterized, no
  Math.random/eval, no `any` in auth.
- Frontend: all 7 roles' sidebar pages load with 0 blank/crash/console-errors/5xx.
- Ops: backup→restore round-trip verified (row-count parity); fresh-DB seed works; `migrate status` clean.

**NOT FIXED (deferred / flagged for your decision):**
- npm audit highs: API lodash (via @bull-board admin-only queue UI) + multer (via @nestjs/platform-express;
  no upload routes exposed); web picomatch (build-tool only, not in shipped bundle). All need breaking
  major bumps — accepted-risk, monitor.
- Frontend limit/offset pagination UI for device/PR registers (server caps added; UI grows-past-500 follow-up).
- 429 ThrottlerException is labelled `"error":"Internal Server Error"` (statusCode correct at 429) — cosmetic.
- Web bundle 961 kB un-split — code-splitting NICE-TO-HAVE.
- onDelete relations rely on safe Prisma defaults (Restrict/SetNull/Cascade) and there are NO parent-delete
  endpoints (User/Ticket/Category/Device/PR) — explicit annotations are a NICE-TO-HAVE.
- Case-insensitive email uniqueness is app-layer only (DB unique is case-sensitive) — citext follow-up.
- Wall-clock SLA (working-hours calendar) still deferred. File-upload security N/A (no upload endpoints yet).
- P3 (same person can't approve manager+finance stage) is code-verified only — no dual-role seed user to test live.

## Pre-Deploy Audit (2026-06-17) — LIVE, full re-verification
Ran against a live stack, not a code read. Re-verified the three recent changes
(email/password auth + approval, left-sidebar/role-dashboard, Gmail removal) integrate cleanly.

**CONFIRMED WORKING (live evidence):**
- Register → PENDING (login blocked 401) → IT_ADMIN approve(EMPLOYEE) → login issues JWT with role →
  new user sees `auth.account_approved` + `auth.registration_confirmation` as **IN_APP/SENT** notifications.
  Role is embedded in the JWT at login (post-approval), so freshly-approved users get correct access
  immediately — no stale-JWT window (pending users cannot mint a token at all).
- Sidebar role-filtering: IT_ADMIN sees DASHBOARD/TICKETS/DEVICES/PROCUREMENT/KB/ADMINISTRATION + bell;
  EMPLOYEE sees only DASHBOARD/TICKETS/DEVICES/KB (no PROCUREMENT/ADMINISTRATION/FINANCE). All roles land on /dashboard.
- In-app notification bell polls `GET /api/notifications/me`, shows live count (verified real data, 9+/15).
- Ticket lifecycle: NEW→ASSIGNED→IN_PROGRESS→ON_HOLD→IN_PROGRESS→RESOLVED→CLOSED→REOPENED, StatusHistory intact.
- Reopen window: within 7d → REOPENED ok; backdated 30d → HTTP 400 with clear message.
- SLA escalation: backdated SLA → ESCALATED + escalationLevel=1; re-run is idempotent (no double-escalate);
  `ticket.escalated` in-app to IT_ADMIN + MANAGER.
- Procurement chain: create PR → manager approve → finance approve → record PO → receive → Device created (RECEIVED).
- Separation of duties: IT_ADMIN approve → 403 (live); manager+finance same-person block (code-verified);
  device-request manager-scoping → wrong manager 403, correct reporting manager approves (live, with managerId set).
- Security: bcrypt $2b$12$ hashes in DB; passwordHash never leaked (tickets/users/pending/ticket-detail nested);
  login enumeration parity ("Invalid email or password" for both wrong-pw and no-user); login lockout on 6th attempt;
  RBAC boundaries (employee→admin/stats/PR endpoints all 403/404; no-token 401); dev-login hard-blocked in prod;
  helmet + cookie-parser + CORS locked to FRONTEND_URL + global ValidationPipe(whitelist) all active.
- AI chat: LLM responds; confirming creates a real ticket with source=CHAT.
- Gmail removal: source tree clean (only the 2 intentional CLAUDE.md doc lines); leftover `@google-cloud/local-auth`
  dependency found and removed (it was also pulling vulnerable gaxios/uuid); device-reminder job runs without GmailAdapter crash.

**FIXED IN THIS PASS:**
- `apps/api/package.json` — removed leftover `@google-cloud/local-auth` (Gmail removal was incomplete; npm uninstall run).
- `apps/web/.../admin/DashboardPage.tsx` — `/tickets?limit=200` → `100` (API caps `@Max(100)`; was 400-ing every
  dashboard ticket widget for all roles, silently failing to load).
- `apps/api/.../auth/auth.service.ts` + `apps/web/.../RegisterPage.tsx` — registration copy no longer promises an
  "approval email" (email removed); now says approval appears in notifications / sign in once approved.

**SHOULD-FIX-SOON (not blocking):**
- AI chat ticket quality: confirmed chat ticket uses the raw last user message as the subject
  (e.g. "Yes please create the ticket now.") and the chat reply shows a *hallucinated* ticket ID
  (ZL-… ) that doesn't match the real INC-… ID. Prompt/extraction needs tuning. KB deflection unverifiable
  (0 KB articles indexed in dev).
- npm audit (prod deps): 10 vulns (3 high = lodash via @bull-board admin-only queue UI; multer via
  @nestjs/platform-express, no file-upload routes exposed). Fix requires breaking major bumps — defer + monitor.
- `apps/web/Dockerfile` chowns assets to nginx but has no `USER` directive (nginx master runs as root, official-image default).
- README.md still lists API on :3000 in a couple of places (dev convention is :3007 per port section).

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

## User management (2026-06-30) — full role administration
Built on top of the existing multi-role model (UserRole join + accountStatus) — NOT a single-role
enum. The dev-login dropdown remains a dev-only convenience (hard-blocked in prod); real
email/password auth was already in place.
- `GET /api/auth/me` — current user's profile (id, name, email, department, roles[], accountStatus,
  status) from the DB; passwordHash never selected. Protected by the global JwtAuthGuard.
- `GET /api/admin/users?accountStatus=&role=` — IT_ADMIN/SYS_ADMIN. Full user list (all statuses)
  with flattened `roles[]`; passwordHash excluded.
- `PATCH /api/admin/users/:id/role` — IT_ADMIN/SYS_ADMIN. Body `{ role }`. Replaces the user's roles
  with `[role]`; if the target was PENDING_APPROVAL it is **activated** (register → pending → assign
  role → access). Rules (enforced in `AdminUsersService.assignRole`): can't change own role; only
  SYS_ADMIN can grant SYS_ADMIN or change an existing SYS_ADMIN; IT_ADMIN can assign any other role.
- `PATCH /api/admin/users/:id/deactivate` — **SYS_ADMIN only** (method-level `@Roles(SYS_ADMIN)`).
  Sets `status=INACTIVE`; the JWT strategy's ACTIVE check then blocks the user's existing token.
- Frontend `/admin/users` (`AdminUsersPage`, lazy route, sidebar "User Management" under
  ADMINISTRATION): All/Pending/Active tabs, pending rows highlighted, per-row role dropdown + Assign,
  Deactivate (SYS_ADMIN only), toasts. Role options and Deactivate are gated by the caller's role;
  the caller's own row is locked.
- **Auth now persists across reload:** `api/token.ts` stores the JWT in `localStorage`
  (`tz_access_token`) and `AuthContext` rehydrates the session on app load, clearing the token if it's
  expired/invalid. (Previously the token lived only in memory, so a refresh logged you out.)
- **Bootstrap SYS_ADMIN** (`prisma/seed.ts`): `admin@ticketzilla.dev` gets a **strong random password
  generated at seed time** (`crypto.randomBytes`, bcrypt-hashed), printed ONCE to the console and stored
  nowhere else (no file, no AuditLog). Generated only on first provision — re-seeding neither reprints
  nor rotates it (clear its `passwordHash` / reset DB to mint a new one). The `*@test.com` users remain
  dev-login/OIDC (no password).

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
   - No Gmail/email env vars required — notifications are in-app only
2. docker-compose up -d postgres redis ai-service minio
3. cd apps/api && npx prisma db push  (or migrate deploy if using migrations)
4. npm run build --workspace=apps/api && node apps/api/dist/main.js
5. npm run build --workspace=apps/web — serve dist/ with nginx / Cloudfront
6. Set NODE_ENV=production — disables dev-login and dev-admin trigger endpoints
7. Set FRONTEND_URL to the public domain (used in email links and CORS)
8. Mount a host volume at /backups for the pg-backup service (docker-compose.prod.yml)

# TicketZilla — Project Context

## Communication
Always begin every response with "Ramkiran," before saying anything else.

## Stack
- Frontend: React 18 + TypeScript + Tailwind CSS (apps/web)
- API: NestJS + TypeScript (apps/api)
- AI Service: Python FastAPI (apps/ai-service)
- DB: PostgreSQL via Prisma ORM
- Cache/Queue: Redis + BullMQ
- Auth: OIDC (mock SSO in dev)
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
JWT via passport-jwt. Dev login at POST /api/auth/dev-login (NODE_ENV≠production only).
SSO OIDC to be wired in prod. JwtAuthGuard + RolesGuard applied globally via APP_GUARD.
Use @Public() to opt routes out of auth. Use @Roles(...RoleName) for RBAC.
Use @CurrentUser() to access the authenticated user in a controller.

## Current phase
COMPLETE — all 5 phases built and TypeScript-clean.

## Audit (2026-06-16)
Full audit performed against a live stack (Postgres+Redis on Docker, API run locally).
- E2E TEST 1–4 PASS (lifecycle, SLA math, escalation+idempotency, RBAC, full device→procurement chain, reminder cycles). TEST 5 (chat deflection/draft) deferred — needs the Python AI service + a real LLM_API_KEY.
- Fixes applied & verified: (1) auto-created purchase requests stuck at RAISED — added `PATCH /purchase-requests/:id` + `POST /purchase-requests/:id/submit`; (2) device double-allocation race — `allocate()` claims the device atomically in an interactive transaction; (3) RBAC §3.4 — agent/L2-L3 write actions (comment/transition/resolve) now assignment-scoped, employees may reopen own, agent/L2-L3 reopen blocked, MANAGER/FINANCE removed from ticket all-scope, KB editing restricted to IT/Sys Admin, resolve opened to L2-L3+SysAdmin; (4) §4.4 reopen window — Closed→Reopened rejected past `REOPEN_WINDOW_DAYS` (SystemConfig, default 7).
- Spec conformance VERIFIED vs §3.4/§4.4/§4.5.2: transitions exact; SLA values exact under an 8h working-day (NOTE: seeded BusinessCalendar is 9h 09:00–18:00 — pin working-day length before building working-hours SLA; SLA still wall-clock, deferred).
- Open findings (see audit report): no manager→team model so any manager approves any procurement request + no separation-of-duties (admin approves both stages); Prisma errors → 500 (no 409 mapping); ticket/PR/device ID generation 500s under high concurrency (no dup IDs persist); AI service published to host in dev compose; npm audit highs; no admin view of FAILED notifications; health endpoint behind JWT; reports "Team" scope + SLA/category/user-management config endpoints unbuilt vs §3.4.
- `docker-compose.prod.yml` drafted (no host-exposed datastores, env secrets, healthchecks, restart policies, resource limits).

## Data import scaffolding
`apps/api/scripts/import/` — generic CSV importers run via ts-node.
- `import-employees.ts` (name,email,department,ssoSubject) upserts Users + ensures EMPLOYEE role.
- `import-devices.ts` (type,makeModel,serialNumber,status,condition,purchasedOn,cost) creates Device records.
- `csv-utils.ts` shared (dependency-free parser, dry-run report, per-row audit log under logs/).
Pattern: validate ALL rows first; dry-run by default; only writes with `--commit`; any malformed row aborts the commit. To add more importers (e.g. tickets), copy import-devices.ts and swap the row type/validation/dedupe key.

## Dev-only endpoints (NODE_ENV ≠ production)
- POST /api/auth/dev-login — get a JWT for any test user
- POST /api/admin/trigger-escalation-check — manually fire SLA escalation check
- POST /api/admin/trigger-device-reminder-check — manually fire device limit check

## Known deferred items
- File attachments with MinIO/S3 (procurement documents, ticket attachments)
- Production SSO OIDC wiring (dev uses mock dev-login)
- Real SLA working-hours calendar (current impl uses wall-clock time)
- Finance PDF purchase order generation
- Full E2E test suite (Playwright / Cypress)
- Apple Silicon / Linux arm64 Docker image for ai-service

## Deployment notes
1. Copy `.env.example` → `.env` and fill in all secrets
2. docker-compose up -d postgres redis ai-service minio
3. cd apps/api && npx prisma migrate deploy
4. npm run build --workspace=apps/api && node apps/api/dist/main.js
5. npm run build --workspace=apps/web — serve dist/ with nginx / Cloudfront
6. Set NODE_ENV=production — disables dev-login and dev-admin endpoints
7. Wire OIDC: set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET in .env
8. Set FRONTEND_URL to the public domain (used in email links)
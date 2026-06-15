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
COMPLETE — all 5 phases built and TypeScript-clean. E2E testing pending Docker environment.

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
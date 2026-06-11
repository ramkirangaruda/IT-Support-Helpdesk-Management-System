# TicketZilla — Project Context

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

## Current phase
MVP — Phase 1
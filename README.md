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

All seed users have password `password123` in production OIDC, or use `POST /api/auth/dev-login` in dev.

| Email | Role | Access |
|-------|------|--------|
| `employee@test.com` | EMPLOYEE | Raise tickets, request devices |
| `agent@test.com` | AGENT | Work tickets, add internal notes |
| `l2@test.com` | L2_L3 | Escalated tickets, agent assist |
| `manager@test.com` | MANAGER | Approve device requests, purchase requests |
| `admin@test.com` | IT_ADMIN | Full admin — devices, procurement, users |
| `finance@test.com` | FINANCE | Finance approvals queue |
| `sysadmin@test.com` | SYS_ADMIN | System config, all access |

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

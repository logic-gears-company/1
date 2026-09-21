# AI SaaS Boilerplate

A production-grade, full-stack AI SaaS starter kit built with Next.js 15, FastAPI, PostgreSQL, Stripe, and support for OpenAI, Anthropic, and Ollama. Ship your AI product in days — not months.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the App](#running-the-app)
- [Pages & Routes](#pages--routes)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [AI Integration](#ai-integration)
- [Billing & Stripe](#billing--stripe)
- [Authentication](#authentication)
- [Deployment](#deployment)
- [Docker](#docker)
- [Kubernetes](#kubernetes)
- [CI/CD](#cicd)
- [Contributing](#contributing)

---

## Overview

This boilerplate gives you everything needed to launch a production AI SaaS product — authentication, billing, AI chat, agents, content generation, automation, knowledge base (RAG), and an admin dashboard — all wired together and ready to customise.

**Demo credentials (after seeding):**

| Role        | Email                 | Password   |
|-------------|-----------------------|------------|
| Super Admin | admin@example.com     | Admin123!  |
| User        | demo@example.com      | Demo1234!  |

---

## UI 

## login screen
<img width="1792" height="1064" alt="Screenshot 2026-05-10 at 12 05 46 PM" src="https://github.com/user-attachments/assets/e963e840-3c4b-494d-961f-55b7652e85bb" />

 ## User 
 
<img width="1790" height="1111" alt="Screenshot 2026-05-10 at 12 02 07 PM" src="https://github.com/user-attachments/assets/18e183f0-34bd-45a5-afb3-ad86e17b7e59" />

 ## AI Agent 
 
<img width="1792" height="1111" alt="Screenshot 2026-05-10 at 12 02 20 PM" src="https://github.com/user-attachments/assets/7ff8301c-25e5-4d1c-ac11-702715c2a0d1" />

<img width="1792" height="1098" alt="Screenshot 2026-05-10 at 12 02 30 PM" src="https://github.com/user-attachments/assets/a0d7763f-065c-4707-bf94-027f1d0f39b9" />

## New AI agent creation screen

<img width="1792" height="1116" alt="Screenshot 2026-05-10 at 12 02 52 PM" src="https://github.com/user-attachments/assets/d8cd1833-f265-4dcd-97dd-a7977930dec5" />

## AI tool - content studio

<img width="1792" height="1120" alt="Screenshot 2026-05-10 at 12 03 03 PM" src="https://github.com/user-attachments/assets/034ee6a6-9ae8-4083-b192-f7eed7508c50" />

<img width="1788" height="1118" alt="Screenshot 2026-05-10 at 12 03 14 PM" src="https://github.com/user-attachments/assets/a6aaf48e-25b2-4352-9bb9-7d6b33104ab6" />

## Automation

<img width="1792" height="1116" alt="Screenshot 2026-05-10 at 12 03 23 PM" src="https://github.com/user-attachments/assets/8be208fa-5412-466c-bd44-4d4d3bd0e849" />

 ## New automation creation

<img width="1791" height="1114" alt="Screenshot 2026-05-10 at 12 03 32 PM" src="https://github.com/user-attachments/assets/1c1c0317-672f-499d-ab04-751e2beda973" />


 ## Admin
 
 <img width="1789" height="1109" alt="Screenshot 2026-05-10 at 12 04 29 PM" src="https://github.com/user-attachments/assets/b62af8cc-20df-41ec-81ff-3d5073611653" />

 <img width="1788" height="1118" alt="Screenshot 2026-05-10 at 12 04 39 PM" src="https://github.com/user-attachments/assets/9ee0f78d-8fd8-408d-89f7-76e61a4b9625" />

<img width="1792" height="1107" alt="Screenshot 2026-05-10 at 12 04 51 PM" src="https://github.com/user-attachments/assets/7e78d2f0-425f-40e4-93be-21e4801f2641" />





## Tech Stack

### Frontend (`apps/web`)

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Framework      | Next.js 15 (App Router, Server Components)    |
| Language       | TypeScript 5.6                                |
| Styling        | Tailwind CSS 3 + shadcn/ui                    |
| UI Components  | Radix UI primitives                           |
| Icons          | Lucide React                                  |
| Fonts          | Geist Sans / Mono                             |
| Auth           | NextAuth.js v5 (Auth.js) + Prisma Adapter     |
| AI Streaming   | Vercel AI SDK (`ai`, `@ai-sdk/openai`)        |
| State          | Zustand + SWR                                 |
| Forms          | React Hook Form + Zod                         |
| Payments       | Stripe.js + React Stripe                      |
| Markdown       | react-markdown + react-syntax-highlighter     |
| Notifications  | Sonner                                        |
| Theming        | next-themes (dark/light/system)               |
| Animations     | Framer Motion                                 |

### Backend (`apps/api`)

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Framework      | FastAPI 0.115                                 |
| Language       | Python 3.12                                   |
| ORM            | SQLAlchemy 2 (async) + Alembic                |
| Auth           | JWT (python-jose) + bcrypt (passlib)          |
| AI             | OpenAI SDK + Anthropic SDK                    |
| HTTP Client    | httpx (async)                                 |
| Validation     | Pydantic v2 + pydantic-settings               |
| Logging        | structlog (JSON)                              |
| Metrics        | Prometheus + OpenTelemetry                    |
| Background     | Celery + Redis                                |
| File Storage   | boto3 (S3-compatible)                         |
| PDF parsing    | pypdf + python-docx                           |

### Infrastructure

| Layer       | Technology                                    |
|-------------|-----------------------------------------------|
| Database    | PostgreSQL 16 + pgvector extension            |
| ORM (web)   | Prisma 5                                      |
| Cache       | Redis 7                                       |
| Monorepo    | Turborepo + npm workspaces                    |
| Containers  | Docker + Docker Compose                       |
| Orchestration | Kubernetes (manifests included)             |
| CI/CD       | GitHub Actions                                |
| Payments    | Stripe (subscriptions + webhooks)             |
| Email       | Resend                                        |
| Storage     | AWS S3 (or any S3-compatible provider)        |

---

## Project Structure

```
ai-saas-boilerplate/
├── apps/
│   ├── web/                        # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── (auth)/             # Login, Register, Forgot Password
│   │   │   ├── (dashboard)/        # Protected user dashboard
│   │   │   │   ├── agents/         # AI Agents builder & runner
│   │   │   │   ├── automation/     # Workflow automation
│   │   │   │   ├── billing/        # Subscription management
│   │   │   │   ├── chat/           # AI Chat interface
│   │   │   │   ├── content/        # AI Content Studio
│   │   │   │   ├── dashboard/      # Overview & stats
│   │   │   │   ├── files/          # Knowledge base / RAG
│   │   │   │   ├── playground/     # AI model playground
│   │   │   │   ├── settings/       # User settings
│   │   │   │   └── team/           # Team management
│   │   │   ├── (admin)/            # Admin-only pages
│   │   │   │   └── admin/
│   │   │   │       ├── analytics/  # Platform analytics
│   │   │   │       └── users/      # User management
│   │   │   ├── (marketing)/        # Public pages
│   │   │   │   ├── page.tsx        # Landing page
│   │   │   │   └── pricing/        # Pricing page
│   │   │   └── api/                # Next.js API routes
│   │   │       ├── auth/           # NextAuth handlers + register
│   │   │       ├── agents/         # Agent CRUD + run
│   │   │       ├── chat/           # Streaming chat
│   │   │       └── webhooks/       # Stripe webhook
│   │   ├── components/
│   │   │   ├── auth/               # Login / Register forms
│   │   │   ├── chat/               # Chat UI + agent mode panel
│   │   │   ├── dashboard/          # Sidebar, header
│   │   │   ├── layout/             # Navbar, footer
│   │   │   └── ui/                 # shadcn/ui base components
│   │   ├── hooks/                  # use-chat, use-subscription
│   │   ├── lib/                    # auth.ts, stripe.ts, utils.ts
│   │   └── middleware.ts           # Auth + RBAC route protection
│   │
│   └── api/                        # FastAPI backend
│       └── app/
│           ├── api/v1/             # REST endpoints
│           │   ├── auth.py         # Register, login, refresh, reset
│           │   ├── users.py        # Profile, usage
│           │   ├── chat.py         # Streaming chat, conversations
│           │   ├── billing.py      # Plans, subscriptions, Stripe
│           │   ├── files.py        # Upload, RAG indexing
│           │   ├── agents.py       # Agent workflows & runs
│           │   ├── api_keys.py     # Key management
│           │   └── admin.py        # Admin endpoints
│           ├── core/
│           │   ├── config.py       # Pydantic settings
│           │   ├── database.py     # Async SQLAlchemy engine
│           │   ├── security.py     # JWT, bcrypt, API key hashing
│           │   └── middleware.py   # Logging, CORS, security headers
│           ├── models/             # SQLAlchemy ORM models
│           ├── schemas/            # Pydantic request/response schemas
│           └── services/
│               └── ai_service.py   # Multi-provider AI abstraction
│
├── packages/
│   ├── database/                   # Prisma schema + client singleton
│   ├── shared/                     # Shared TS types + utilities
│   ├── agents/                     # ReAct agent + multi-agent framework
│   ├── ui/                         # Shared UI component library
│   └── config/                     # ESLint, TypeScript, Tailwind configs
│
├── infrastructure/
│   ├── kubernetes/                 # K8s deployment, service, ingress
│   └── docker/                     # init.sql, prometheus.yml
│
├── scripts/
│   ├── seed.ts                     # DB seed (plans + demo users)
│   └── setup.sh                    # One-command dev setup
│
├── .github/workflows/
│   ├── ci.yml                      # Lint, type-check, test, build
│   └── deploy.yml                  # Deploy to K8s + Vercel
│
├── docker-compose.yml              # Dev stack
├── turbo.json                      # Turborepo config
└── .env.example                    # All environment variables documented
```

---

## Features

### Authentication
- Email/password login and registration with password strength validation
- Google OAuth and GitHub OAuth (conditional on credentials)
- JWT access + refresh token strategy
- Session management via NextAuth.js v5
- Password reset flow with secure token
- Email verification
- Role-based access control: `USER`, `ADMIN`, `SUPER_ADMIN`
- Protected routes via Next.js middleware
- Multi-device session support

### AI Chat
- Streaming responses via Vercel AI SDK
- Multi-conversation support with persistent history
- Markdown rendering with syntax-highlighted code blocks
- Copy code button on code blocks
- Agent Mode toggle — run autonomous agents directly from chat
- Tool selection panel (Web Search, Calculator, Code Executor)
- Live step-by-step agent execution trace
- Empty state with example prompts (switches context for agent mode)
- Conversation auto-titling

### AI Providers
- **OpenAI** — GPT-4o, GPT-4o mini (default)
- **Anthropic** — Claude 3.5 Sonnet, Claude 3.5 Haiku
- **Ollama** — any local model (llama3.2, mistral, etc.)
- Single `AIService` abstraction in FastAPI — swap providers per-request
- Configurable via environment variables

### AI Agents
- Interactive agent builder with dialog form
- Fields: name, description, system prompt, model, tools, temperature, max iterations
- Tool selection: Web Search, Calculator, Code Executor
- 4 built-in templates: Research, Data Analyst, Code Reviewer, Content Writer
- Run dialog with live streaming step trace (thought → tool call → tool result → response)
- Expandable step cards with timestamps
- Copy result to clipboard
- Run history table (Runs tab)
- Research Agent template page (`/agents/templates/research`) with topic input and example starters

### AI Content Studio
- 8 content types: Blog Post, Email, Twitter/X Thread, LinkedIn Post, Marketing Copy, Product Description, Technical Documentation, Code Comments
- Per-type smart form fields (audience, tone, length, SEO keywords, etc.)
- Live streaming output panel with word count
- Regenerate and copy buttons
- System prompt optimised per content type

### Automation
- Create trigger-based AI workflows
- Trigger types: Schedule (Cron), Webhook, File Upload, User Signup, Usage Threshold, API Call
- Action types: AI Content Generation, Run Agent, Send Email, Index to Knowledge Base, Call Webhook, Slack Notification
- 6 pre-built templates with one-click add
- Toggle enable/pause per workflow
- Category filter on templates
- Create automation dialog with cron preset picker and trigger→action visual flow

### Knowledge Base (RAG)
- Upload PDFs, DOCX, TXT, MD, CSV files
- Automatic text extraction, chunking (512 tokens, 64 overlap)
- pgvector embeddings via `text-embedding-3-small`
- Semantic search ready
- File status tracking: UPLOADING → PROCESSING → READY / FAILED
- Storage via S3-compatible provider
- File list with size, chunk count, status indicators

### Billing
- Stripe subscriptions (monthly + yearly)
- Three tiers: Free, Pro ($29/mo), Enterprise ($99/mo)
- 14-day free trial on paid plans
- Stripe Checkout session creation
- Customer portal for plan changes and payment methods
- Webhook handler for subscription lifecycle events
- Invoice history via Stripe API
- Free plan auto-assigned on registration
- Usage limits enforced per plan (tokens, messages, storage, team members, API keys)

### API Keys
- Generate API keys with `sk-` prefix
- Keys are SHA-256 hashed — only prefix shown after creation
- Revoke keys individually
- Keys accepted alongside JWT tokens for authentication
- Request count tracking

### Team Management
- Team member list with roles
- Invite by email with role selection
- Roles: OWNER, ADMIN, MEMBER, VIEWER
- Role permission descriptions

### Admin Dashboard
- **Overview** — total users, active subscriptions, total messages, conversations
- **Users** — searchable/filterable table, role filter, pagination, conversation/message/token counts per user, verify/suspend actions
- **Analytics** — daily messages and signups bar charts (7 days), AI provider usage breakdown, subscription plan distribution, top conversations table, token consumption with estimated API cost

### AI Playground
- Model selector (all configured providers)
- System prompt editor
- Temperature and max token sliders
- Streaming response with cursor animation
- Copy response button
- Clear / regenerate

### Security
- JWT with access (30 min) + refresh (7 day) tokens
- API keys SHA-256 hashed in database
- bcrypt password hashing (rounds: 12)
- Input validation: Zod (frontend) + Pydantic (API)
- SQL injection prevention via Prisma ORM and SQLAlchemy
- CORS restricted to configured origins
- Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS (production)
- Rate limiting hooks in middleware
- Audit log for sensitive actions (login, register, API key create/revoke, etc.)

### Developer Experience
- Turborepo monorepo with shared packages
- Shared TypeScript types (`@ai-saas/shared`)
- Shared UI components (`@ai-saas/ui`)
- Prisma Studio for database inspection
- One-command setup script (`bash scripts/setup.sh`)
- DB seed with demo users and plans
- `.env.example` documenting all variables
- ESLint + Prettier + Husky pre-commit hooks
- Structured JSON logging (structlog)
- Prometheus metrics at `/metrics`

---

## Getting Started

### Prerequisites

| Tool      | Version  |
|-----------|----------|
| Node.js   | ≥ 20     |
| npm       | ≥ 10     |
| Python    | 3.12     |
| Docker    | ≥ 24     |
| Git       | any      |

### One-command setup

```bash
git clone https://github.com/your-org/ai-saas-boilerplate.git
cd ai-saas-boilerplate
bash scripts/setup.sh
```

This script:
1. Copies `.env.example` → `.env`
2. Installs npm dependencies (`npm install`)
3. Generates the Prisma client
4. Starts PostgreSQL and Redis via Docker Compose
5. Pushes the database schema (`prisma db push`)
6. Seeds the database with plans and demo users
7. Sets up the Python virtual environment and installs API deps

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. The critical ones are:

```bash
# Database (auto-configured by docker-compose)
DATABASE_URL="postgresql://postgres:password@localhost:5434/ai_saas?schema=public"

# Auth — generate with: openssl rand -base64 32
AUTH_SECRET=your-secret-here
NEXTAUTH_SECRET=your-secret-here

# AI — at least one provider required for chat to work
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Stripe — required for billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

See `.env.example` for the full list including OAuth, email, S3, observability, and feature flags.

---

## Running the App

### Development (recommended)

```bash
# Start databases
docker compose up -d postgres redis

# Start both Next.js and FastAPI
npm run dev

# Or start individually
npm run dev --workspace=apps/web     # → http://localhost:3000
cd apps/api && uvicorn app.main:app --reload  # → http://localhost:8000
```

### Useful commands

```bash
# Database
npm run db:generate     # Regenerate Prisma client
npm run db:push         # Push schema changes (dev)
npm run db:migrate      # Create a migration
npm run db:studio       # Open Prisma Studio GUI
npm run db:seed         # Seed demo data

# Monorepo
npm run build           # Build all packages
npm run lint            # Lint all packages
npm run type-check      # TypeScript check all packages
npm run clean           # Clean all build outputs

# FastAPI
cd apps/api
source .venv/bin/activate
pytest tests/            # Run API tests
```

---

## Pages & Routes

### Public (marketing)

| Route      | Description                              |
|------------|------------------------------------------|
| `/`        | Landing page with hero, features, CTA    |
| `/pricing` | Pricing tiers with Stripe checkout links |

### Auth

| Route              | Description                   |
|--------------------|-------------------------------|
| `/login`           | Email/password + OAuth login  |
| `/register`        | New account registration      |
| `/forgot-password` | Password reset request        |
| `/verify-email`    | Email verification            |

### Dashboard (requires login)

| Route                          | Description                                   |
|--------------------------------|-----------------------------------------------|
| `/dashboard`                   | Overview: token usage, stats, quick actions   |
| `/chat`                        | AI chat with Agent Mode toggle                |
| `/agents`                      | Build, configure, and run AI agents           |
| `/agents/templates/research`   | Interactive Research Agent with step trace    |
| `/content`                     | AI Content Studio (8 content types)           |
| `/automation`                  | Trigger-based AI workflow automation          |
| `/playground`                  | AI model playground with parameter controls  |
| `/files`                       | Knowledge base — upload and index documents  |
| `/settings`                    | Profile and account settings                  |
| `/billing`                     | Subscription plan and invoice management      |
| `/api-keys`                    | API key generation and revocation             |
| `/team`                        | Team members, roles, and invitations          |

### Admin (ADMIN / SUPER_ADMIN only)

| Route               | Description                                      |
|---------------------|--------------------------------------------------|
| `/admin`            | Platform overview — users, messages, revenue     |
| `/admin/users`      | Full user table with search, filter, pagination  |
| `/admin/analytics`  | Charts: daily activity, provider usage, plans    |

---

## API Reference

### Next.js API Routes

| Method | Route                        | Description                          |
|--------|------------------------------|--------------------------------------|
| GET    | `/api/auth/[...nextauth]`    | NextAuth.js handler                  |
| POST   | `/api/auth/[...nextauth]`    | Sign in / OAuth callbacks            |
| POST   | `/api/auth/register`         | Create new user account              |
| POST   | `/api/chat`                  | Streaming AI chat (Vercel AI SDK)    |
| GET    | `/api/agents/create`         | List user's agent workflows          |
| POST   | `/api/agents/create`         | Create new agent workflow            |
| DELETE | `/api/agents/create?id=`     | Delete agent workflow                |
| POST   | `/api/agents/run`            | Run agent with streaming SSE output  |
| GET    | `/api/agents/runs`           | List agent run history               |
| POST   | `/api/webhooks/stripe`       | Stripe webhook event handler         |

### FastAPI Routes (`/api/v1`)

| Method | Route                          | Description                          |
|--------|--------------------------------|--------------------------------------|
| POST   | `/api/v1/auth/register`        | Register user                        |
| POST   | `/api/v1/auth/login`           | Login, returns JWT tokens            |
| POST   | `/api/v1/auth/refresh`         | Refresh access token                 |
| POST   | `/api/v1/auth/forgot-password` | Send password reset link             |
| POST   | `/api/v1/auth/reset-password`  | Reset with token                     |
| GET    | `/api/v1/auth/me`              | Current user info                    |
| GET    | `/api/v1/users/me`             | User profile                         |
| PATCH  | `/api/v1/users/me`             | Update profile                       |
| GET    | `/api/v1/users/me/usage`       | Token and message usage              |
| GET    | `/api/v1/chat/conversations`   | List conversations                   |
| POST   | `/api/v1/chat/conversations`   | Create conversation                  |
| GET    | `/api/v1/chat/conversations/:id` | Get conversation with messages     |
| POST   | `/api/v1/chat/completions`     | Streaming AI chat (SSE)              |
| GET    | `/api/v1/billing/plans`        | Available subscription plans         |
| GET    | `/api/v1/billing/subscription` | Current subscription                 |
| POST   | `/api/v1/billing/checkout`     | Create Stripe Checkout session       |
| POST   | `/api/v1/billing/portal`       | Create Stripe customer portal        |
| POST   | `/api/v1/billing/webhook`      | Stripe webhook handler               |
| GET    | `/api/v1/api-keys`             | List API keys                        |
| POST   | `/api/v1/api-keys`             | Create API key                       |
| DELETE | `/api/v1/api-keys/:id`         | Revoke API key                       |
| GET    | `/api/v1/files`                | List uploaded files                  |
| POST   | `/api/v1/files/upload`         | Upload file (triggers RAG indexing)  |
| DELETE | `/api/v1/files/:id`            | Delete file and chunks               |
| GET    | `/api/v1/agents/workflows`     | List agent workflows                 |
| POST   | `/api/v1/agents/workflows`     | Create workflow                      |
| GET    | `/api/v1/agents/runs`          | List agent runs                      |
| POST   | `/api/v1/agents/run`           | Run agent (streaming SSE)            |
| GET    | `/api/v1/admin/stats`          | Platform statistics                  |
| GET    | `/api/v1/admin/users`          | Paginated user list                  |
| PATCH  | `/api/v1/admin/users/:id/role` | Change user role                     |
| DELETE | `/api/v1/admin/users/:id`      | Soft-delete user                     |

Full interactive docs available at `http://localhost:8000/docs` (development only).

---

## Database Schema

The Prisma schema (`packages/database/prisma/schema.prisma`) defines 17 models:

| Model           | Purpose                                               |
|-----------------|-------------------------------------------------------|
| `User`          | Core user record with roles and usage counters        |
| `Account`       | OAuth provider accounts (NextAuth)                    |
| `Session`       | Active login sessions (NextAuth)                      |
| `VerificationToken` | Email verification tokens                         |
| `Team`          | Multi-tenant team workspace                           |
| `TeamMember`    | User ↔ team membership with role                     |
| `TeamInvite`    | Pending team invitations                              |
| `Plan`          | Subscription plan definition with limits              |
| `Subscription`  | User's active Stripe subscription                     |
| `Invoice`       | Stripe invoice records                                |
| `ApiKey`        | Hashed API keys with scopes and expiry                |
| `Conversation`  | AI chat session (model, provider, system prompt)      |
| `Message`       | Individual message with token usage                   |
| `File`          | Uploaded file metadata                                |
| `Chunk`         | Text chunk with pgvector embedding (1536 dims)        |
| `AgentWorkflow` | Saved agent configuration                             |
| `AgentRun`      | Agent execution record with steps and tokens          |
| `AuditLog`      | Security audit trail                                  |
| `Notification`  | In-app notifications                                  |
| `FeatureFlag`   | Feature flag with rollout percentage                  |

---

## AI Integration

### Adding a new provider

1. Add the API key to `.env`
2. In `apps/api/app/services/ai_service.py`, add a new `_stream_<provider>` method
3. Add to the `stream_chat` dispatcher
4. Add the model to `MODELS` in `apps/web/app/(dashboard)/playground/page.tsx`

### Using local Ollama

```bash
# Pull a model
docker compose --profile ollama up -d ollama
docker exec ai_saas_ollama ollama pull llama3.2

# Set in .env
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_AI_PROVIDER=ollama
DEFAULT_AI_MODEL=llama3.2
```

### RAG pipeline

Files uploaded via `/api/v1/files/upload`:
1. Extracted to plain text (PDF → pypdf, DOCX → python-docx, CSV → pandas)
2. Chunked into 512-token windows with 64-token overlap
3. Embedded via `text-embedding-3-small` (1536 dimensions)
4. Stored as pgvector rows in the `chunks` table
5. Queried via cosine similarity search

---

## Billing & Stripe

### Setup

1. Create products and prices in the [Stripe Dashboard](https://dashboard.stripe.com)
2. Copy price IDs to `.env`:
   ```
   STRIPE_PRICE_PRO_MONTHLY=price_xxx
   STRIPE_PRICE_PRO_YEARLY=price_xxx
   STRIPE_PRICE_ENTERPRISE_MONTHLY=price_xxx
   ```
3. Start the Stripe CLI to forward webhooks locally:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Copy the webhook secret to `STRIPE_WEBHOOK_SECRET`

### Subscription lifecycle

The webhook handler (`/api/webhooks/stripe`) handles:
- `customer.subscription.created` — creates `Subscription` record
- `customer.subscription.updated` — syncs status and period dates
- `customer.subscription.deleted` — marks subscription as `CANCELED`
- `invoice.payment_succeeded` — records invoice
- `invoice.payment_failed` — triggers user notification

---

## Authentication

NextAuth.js v5 is configured in `apps/web/lib/auth.ts`:
- **Strategy:** JWT (stateless, no DB session required)
- **Providers:** Credentials, Google (optional), GitHub (optional)
- **Adapter:** Prisma (for OAuth account linking)
- **Session token:** 30-day expiry
- **Role:** stored in JWT claims, available in `session.user.role`

OAuth providers are loaded conditionally — they require real client IDs in `.env` to activate.

---

## Deployment

### Vercel (Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd apps/web
vercel --prod
```

Set all environment variables in the Vercel project settings.

### Fly.io / Railway (API)

```bash
# Fly.io
fly launch --dockerfile apps/api/Dockerfile
fly secrets set DATABASE_URL="..." OPENAI_API_KEY="..."
fly deploy
```

---

## Docker

```bash
# Start dev stack (postgres + redis + web + api)
docker compose up

# Start only databases
docker compose up -d postgres redis

# Start with local AI (Ollama)
docker compose --profile ollama up

# Start with monitoring (Prometheus + Grafana)
docker compose --profile monitoring up
# Grafana → http://localhost:3001 (admin/admin)
# Prometheus → http://localhost:9090
```

### Production build

```bash
# Build images
docker build -t ai-saas-web ./apps/web
docker build -t ai-saas-api ./apps/api

# Run production
docker compose -f docker-compose.prod.yml up
```

---

## Kubernetes

Manifests are in `infrastructure/kubernetes/`:

```bash
# Create namespace and apply all manifests
kubectl apply -f infrastructure/kubernetes/

# Scale the API deployment
kubectl scale deployment ai-saas-api --replicas=4 -n ai-saas

# Check rollout status
kubectl rollout status deployment/ai-saas-api -n ai-saas

# View logs
kubectl logs -l app=ai-saas-api -n ai-saas --tail=100 -f
```

The HorizontalPodAutoscaler scales the API between 2–10 replicas based on CPU (70%) and memory (80%).

Update `infrastructure/kubernetes/ingress.yaml` with your domain before deploying.

---

## CI/CD

### GitHub Actions workflows

**`ci.yml`** — runs on every push and pull request:
- Lint and type-check (TypeScript)
- FastAPI test suite (with real PostgreSQL + Redis services)
- Next.js build verification
- Docker image build (main branch only)
- Trivy security scan

**`deploy.yml`** — runs on push to `main`:
- Build and push Docker images to registry
- Deploy API to Kubernetes
- Deploy frontend to Vercel
- Run Prisma migrations

### Required secrets

Set these in GitHub → Settings → Secrets:

```
DATABASE_URL
DIRECT_URL
AUTH_SECRET
OPENAI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
REGISTRY_URL
REGISTRY_USERNAME
REGISTRY_PASSWORD
KUBECONFIG
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run checks: `npm run lint && npm run type-check`
5. Commit: `git commit -m "feat: add your feature"`
6. Push: `git push origin feat/your-feature`
7. Open a pull request

Please follow the existing code style (ESLint + Prettier enforced via Husky).

---

## License

MIT — free for personal and commercial use.

#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║    AI SaaS Boilerplate — Setup Script        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── Check prerequisites ──────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js >= 20 required"
command -v npm >/dev/null 2>&1 || error "npm required"
command -v docker >/dev/null 2>&1 || warn "Docker not found — skipping container setup"
command -v python3 >/dev/null 2>&1 || warn "Python 3.12 not found — API setup skipped"

NODE_VER=$(node --version | tr -d 'v' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then
  error "Node.js >= 20 required (found v$NODE_VER)"
fi

log "Prerequisites OK ✓"

# ─── Copy .env ────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  log "Created .env from .env.example — please fill in your secrets"
else
  log ".env already exists — skipping"
fi

# ─── Install npm dependencies ─────────────────────────────────────────────────
log "Installing npm dependencies..."
npm install

# ─── Generate Prisma client ───────────────────────────────────────────────────
log "Generating Prisma client..."
npx prisma generate --schema=packages/database/prisma/schema.prisma

# ─── Start Docker services ────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  log "Starting Docker services (postgres + redis)..."
  docker compose up -d postgres redis
  log "Waiting for postgres to be ready..."
  sleep 5
fi

# ─── Run DB migrations ────────────────────────────────────────────────────────
log "Running database migrations..."
npx prisma migrate dev --schema=packages/database/prisma/schema.prisma --name init || \
  warn "Migration failed — run manually: npx prisma migrate dev"

# ─── Seed database ────────────────────────────────────────────────────────────
log "Seeding database..."
npm run db:seed || warn "Seeding failed — run manually: npm run db:seed"

# ─── Python API setup ─────────────────────────────────────────────────────────
if command -v python3 >/dev/null 2>&1; then
  log "Setting up Python API..."
  cd apps/api
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt -q
  cd ../..
  log "Python API setup complete ✓"
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys (OpenAI, Stripe, etc.)"
echo "  2. Run: npm run dev"
echo "     → Web:  http://localhost:3000"
echo "     → API:  http://localhost:8000/docs"
echo ""
echo "Demo credentials:"
echo "  Admin: admin@example.com / Admin123!"
echo "  User:  demo@example.com  / Demo1234!"
echo ""

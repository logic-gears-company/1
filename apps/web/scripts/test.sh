#!/usr/bin/env bash
# Corre TODOS los tests del núcleo (puros + integración de /api/chat) desde apps/web.
# No requiere red ni BD. Resuelve tsx aunque no esté en el PATH de node.
# Uso:  bash scripts/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) Localiza el loader de tsx (raíz del monorepo, apps/web o global).
LOADER=""
for c in ../../node_modules/tsx/dist/loader.mjs node_modules/tsx/dist/loader.mjs; do
  [ -f "$c" ] && LOADER="$c" && break
done
if [ -z "$LOADER" ] && command -v tsx >/dev/null 2>&1; then
  LOADER="$(dirname "$(dirname "$(readlink -f "$(command -v tsx)")")")/dist/loader.mjs"
fi
[ -n "$LOADER" ] && [ -f "$LOADER" ] || { echo "No encuentro tsx (npm install en la raíz)"; exit 1; }

# 2) El alias @/ solo hace falta si apps/web/tsconfig.json no existe (en el repo real sí existe).
TMPCFG=0
if [ ! -f tsconfig.json ]; then
  echo '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./*"]}}}' > tsconfig.json; TMPCFG=1
fi
trap '[ "$TMPCFG" = 1 ] && rm -f tsconfig.json' EXIT

echo "== Tests puros (logger, memoria, política de chat, perfil) =="
node --import "$LOADER" --test \
  lib/observability/__tests__/*.test.ts lib/ai/__tests__/*.test.ts lib/profile/__tests__/*.test.ts \
  $(ls lib/memory/__tests__/*.test.ts | grep -v -E '(usage-store|topic-store|learn)\.test\.ts')

echo "== Integración de /api/chat (con dobles de BD/SDK) =="
node --require ./app/api/chat/__tests__/_mocks/register.cjs --import "$LOADER" --test \
  app/api/chat/__tests__/route.test.ts

echo "== Integración de /api/profile (con dobles de BD/auth) =="
node --require ./app/api/profile/__tests__/_mocks/register.cjs --import "$LOADER" --test \
  app/api/profile/__tests__/routes.test.ts

echo "== Integración de last_used_at (memoria; con doble de Prisma) =="
node --require ./lib/memory/__tests__/_mocks/usage-register.cjs --import "$LOADER" --test \
  lib/memory/__tests__/usage-store.test.ts

echo "== Integración de forget-topic / suppressKey (memoria; con doble de Prisma) =="
node --require ./lib/memory/__tests__/_mocks/topic-register.cjs --import "$LOADER" --test \
  lib/memory/__tests__/topic-store.test.ts

echo "== Integración de learn.ts (cableado de «no recuerdes esto»; doble de store) =="
node --require ./lib/memory/__tests__/_mocks/learn-register.cjs --import "$LOADER" --test \
  lib/memory/__tests__/learn.test.ts

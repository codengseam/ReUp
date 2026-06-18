#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

if [ -f ".env.local" ]; then
  echo "Loading environment from .env.local..."
  set -a
  # shellcheck source=/dev/null
  source .env.local
  set +a
fi

HOSTNAME=${HOSTNAME:-0.0.0.0}
PORT=${PORT:-${REUP_PORT:-5000}}
DATABASE_URL=${DATABASE_URL:-file:./data/dev.db}
NODE_ENV=${NODE_ENV:-production}
HF_HOME=${HF_HOME:-./data/.cache/hub}
TRANSFORMERS_CACHE=${TRANSFORMERS_CACHE:-./data/.cache/hub}

export HOSTNAME PORT DATABASE_URL NODE_ENV HF_HOME TRANSFORMERS_CACHE REUP_PORT

mkdir -p data "$(dirname "${DATABASE_URL#file:}")"

if [ -d "prisma/migrations" ] && [ -n "$(ls -A prisma/migrations 2>/dev/null || true)" ]; then
  echo "Deploying Prisma migrations..."
  pnpm prisma migrate deploy
else
  echo "No migrations found, pushing schema (schema-first init)..."
  pnpm prisma db push
fi

if [ ! -f "data/skill-vectors.json" ]; then
  echo "⚠️  data/skill-vectors.json not found. The app will start but RAG retrieval may be empty until you build or provide a knowledge base."
fi

export REUP_STARTED_AT
REUP_STARTED_AT=$(date +%s000)

echo ""
echo "Starting AI Chat scaffold (loop mode)..."
echo "  HOSTNAME:      $HOSTNAME"
echo "  PORT:          $PORT"
echo "  DATABASE_URL:  $DATABASE_URL"
echo "  NODE_ENV:      $NODE_ENV"
echo "  HF_HOME:       $HF_HOME"
echo ""

exec node dist/server.js

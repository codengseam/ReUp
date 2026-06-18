#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

echo "Checking prerequisites..."

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >= 20 is required (found $NODE_VERSION)." >&2
  exit 1
fi
echo "  Node.js: $NODE_VERSION ✓"

PNPM_VERSION=$(pnpm --version | sed 's/v//')
PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
if [ "$PNPM_MAJOR" -lt 9 ]; then
  echo "Error: pnpm >= 9 is required (found $PNPM_VERSION)." >&2
  exit 1
fi
echo "  pnpm: $PNPM_VERSION ✓"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile

echo "Generating Prisma client..."
pnpm prisma generate

echo "Building Next.js app..."
pnpm next build

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Preparing data directory..."
mkdir -p data

if [ ! -f ".env.local" ]; then
  echo "Creating .env.local from example..."
  cp .env.local.example .env.local
  echo ""
  echo "⚠️  Please edit .env.local and set your DASHSCOPE_API_KEY before running the app."
  echo ""
fi

echo "Installation complete. Run: ./scripts/loop-start.sh"

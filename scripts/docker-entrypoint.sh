#!/bin/bash
set -Eeuo pipefail

echo "==================================="
echo "AI Chat 启动中..."
echo "NODE_ENV: ${NODE_ENV:-not set}"
echo "PORT: ${PORT:-5000}"
echo "DATABASE_URL: ${DATABASE_URL:-not set}"
echo "==================================="

cd /app

# 确保运行用户可以写入数据目录（entrypoint 以 root 运行）
chown -R appuser:appgroup /app/data /app/data/.cache || true

# 如果数据卷挂载后为空，把镜像内置默认数据复制过来
if [ -z "$(ls -A /app/data 2>/dev/null || true)" ]; then
    echo "/app/data 为空，复制默认数据模板..."
    cp -r /app/data-template/. /app/data/
    chown -R appuser:appgroup /app/data || true
    chmod -R u+rw /app/data || true
fi

DB_URL="${DATABASE_URL:-file:/app/data/dev.db}"
DB_DIR="$(dirname "${DB_URL#file:}")"
mkdir -p "$DB_DIR"

HF_HOME="${HF_HOME:-/app/data/.cache/hub}"
TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-/app/data/.cache/hub}"
TMPDIR="${TMPDIR:-/app/data/.cache/tmp}"
mkdir -p "$HF_HOME" "$TRANSFORMERS_CACHE" "$TMPDIR"

if [ ! -d "prisma/generated" ]; then
    echo "prisma/generated 不存在，执行 pnpm prisma generate..."
    pnpm prisma generate
    chown -R appuser:appgroup /app/prisma/generated || true
fi

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations)" ]; then
    echo "发现 migrations，执行 pnpm prisma migrate deploy..."
    pnpm prisma migrate deploy
else
    echo "prisma/migrations 不存在或为空，跳过迁移"
fi

if [ ! -f "data/skill-vectors.json" ]; then
    echo "WARNING: data/skill-vectors.json 不存在，向量检索功能可能不可用"
fi

echo "Dropping privileges to appuser..."
exec gosu appuser "$@"

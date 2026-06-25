#!/bin/bash
# scripts/docker-entrypoint.sh
# 容器启动入口: 先跑 prisma migrate (如有), 再启动 Next.js server
# 设计:
# - 幂等: migrate deploy 重复执行不会出错
# - 失败快: migrate 失败立即退出, 不让 server 起来后才发现 schema 漂移
# - 可观测: 每步都打印日志

set -Eeuo pipefail

echo "================================================"
echo " ReUp container starting"
echo "  NODE_ENV      = ${NODE_ENV:-development}"
echo "  PORT          = ${PORT:-5000}"
echo "  LOOP_ENG_DB   = ${LOOP_ENGINEERING_DB:-<unset, will use default>}"
echo "  VECTORS_PATH  = ${REUP_VECTORS_PATH:-<default data/skill-vectors.json>}"
echo "  HF_HOME       = ${HF_HOME:-<unset>}"
echo "================================================"

cd /app

# 1) 确保数据目录存在 (volume 挂载点 / ModelScope /mnt/workspace)
mkdir -p "$(dirname "${LOOP_ENGINEERING_DB:-/app/data/loop-engineering.sqlite}")"
mkdir -p "${HF_HOME:-/app/.cache/hub}"
mkdir -p "${TMPDIR:-/app/.cache/tmp}"

# 2) Prisma migrate deploy (生产环境推荐)
#    如果 prisma/migrations 不存在, 跳过 (项目当前用 schema-first, 无迁移文件)
if [ -d "prisma/migrations" ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  if ! pnpm prisma migrate deploy; then
    echo "[entrypoint] ERROR: prisma migrate deploy failed" >&2
    exit 1
  fi
  echo "[entrypoint] Migrations applied."
else
  echo "[entrypoint] No prisma migrations directory found, skipping (schema is applied lazily by better-sqlite3)."
fi

# 3) 确保 prisma client 已生成 (镜像里已 COPY, 但 volume 挂载可能覆盖)
if [ ! -d "prisma/generated" ]; then
  echo "[entrypoint] prisma/generated missing, running prisma generate..."
  pnpm prisma generate
fi

# 4) 健康自检: 启动前确认向量索引文件存在
VECTORS_PATH="${REUP_VECTORS_PATH:-/app/data/skill-vectors.json}"
if [ ! -f "$VECTORS_PATH" ]; then
  echo "[entrypoint] WARNING: vectors file not found at $VECTORS_PATH" >&2
  echo "[entrypoint]          RAG search will fail at runtime. Mount it via volume or bake into image." >&2
else
  SIZE=$(stat -c%s "$VECTORS_PATH" 2>/dev/null || stat -f%z "$VECTORS_PATH" 2>/dev/null || echo "?")
  echo "[entrypoint] Vectors file OK: $VECTORS_PATH ($SIZE bytes)"
fi

echo "[entrypoint] Starting: $*"
exec "$@"

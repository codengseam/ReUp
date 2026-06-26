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
if [ -n "${DASHSCOPE_API_KEY:-}" ]; then
  echo "  DASHSCOPE_API_KEY = <set, length ${#DASHSCOPE_API_KEY}>"
else
  echo "  DASHSCOPE_API_KEY = <unset>"
fi
if [ -n "${ZHIPU_API_KEY:-}" ]; then
  echo "  ZHIPU_API_KEY     = <set, length ${#ZHIPU_API_KEY}>"
else
  echo "  ZHIPU_API_KEY     = <unset>"
fi
echo "================================================"

cd /app

# 1) 确保数据目录存在 (volume 挂载点 / ModelScope /mnt/workspace)
mkdir -p "$(dirname "${LOOP_ENGINEERING_DB:-/app/data/loop-engineering.sqlite}")"
mkdir -p "${HF_HOME:-/app/.cache/hub}"
mkdir -p "${TMPDIR:-/app/.cache/tmp}"
# 管理员配置目录 (ModelScope: /mnt/workspace/config; 本地/compose: /app/data)
mkdir -p "${REUP_CONFIG_DIR:-/app/data}"

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

# 4) Prisma db push: 幂等建表 (schema-first, 项目无 migrations 目录)
#    开发期 schema 频繁变动, db push 比 migrate deploy 更适合当前阶段。
#    幂等: 重复执行安全 (表已存在则校验/补齐列)。
#    失败不阻断启动: 打印明确日志后继续, 允许降级运行。
#    影响范围 (非仅 analytics): db push 失败意味着所有 Prisma 表均未建表 ——
#      AnalyticsEvent / InterviewSession / InterviewReview / OfferPrediction。
#    后果: 不仅 analytics store 回落内存 (见 src/server/analytics/store.ts),
#      interview / offer / review 等功能的持久化也会静默失败。
#    --skip-generate: step 3 已执行 prisma generate, 此处跳过冗余生成。
#    --accept-data-loss: 非交互环境自动接受 schema 变更可能的数据丢失提示。
echo "[entrypoint] Running prisma db push --accept-data-loss --skip-generate (idempotent schema sync)..."
if ! pnpm prisma db push --accept-data-loss --skip-generate; then
  echo "[entrypoint] ERROR: prisma db push failed — DB tables may not exist." >&2
  echo "[entrypoint]          Persistence will degrade to in-memory; data lost on restart." >&2
  echo "[entrypoint]          Continuing startup in degraded mode." >&2
else
  echo "[entrypoint] Schema synced to DB (tables ensured)."
fi

# 5) 健康自检: 启动前确认向量索引文件存在
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

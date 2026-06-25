# syntax=docker/dockerfile:1.7
# ReUp 生产镜像 — 多阶段构建
# 阶段: deps (原生依赖编译) -> builder (next build + tsup) -> runner (运行时)
#
# 关键点:
# - better-sqlite3 / sharp 是原生 Node 模块, 必须在 deps 阶段用 build-essential 编译
# - prisma generated client 在 builder 阶段生成, 复制到 runner
# - @xenova/transformers 是动态加载的可选依赖, 运行时按需安装或预下载模型
# - data/skill-vectors.json (27MB) 已在仓库, 直接 COPY
# - dev.db / loop-engineering.sqlite 通过 volume 挂载, 不进镜像

ARG NODE_VERSION=20
ARG PNPM_VERSION=9
# ModelScope Spaces 要求端口 7860 (健康检查探测此端口)
# fly.io / docker-compose 通过运行时 env PORT=5000 覆盖
# 非 root 用户 UID/GID (需与 volume 挂载宿主目录权限对齐)
ARG APP_UID=1001
ARG APP_GID=1001

# ============================================================================
# Stage 1: deps — 安装所有依赖 (含 devDependencies, 用于构建)
# ============================================================================
FROM node:${NODE_VERSION}-slim AS deps
ARG PNPM_VERSION

WORKDIR /app

# 原生模块编译工具链 (better-sqlite3, sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# 只复制 manifest, 利用 docker 层缓存
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN pnpm install --frozen-lockfile

# ============================================================================
# Stage 2: builder — Next.js build + tsup 打包 server + prisma generate
# ============================================================================
FROM node:${NODE_VERSION}-slim AS builder
ARG PNPM_VERSION

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# 1) 生成 Prisma client
RUN pnpm prisma generate

# 2) Next.js 生产构建
RUN pnpm next build

# 3) tsup 打包自定义 server 入口
RUN pnpm tsup src/server.ts \
    --format cjs \
    --platform node \
    --target node20 \
    --outDir dist \
    --no-splitting \
    --no-minify

# ============================================================================
# Stage 3: runner — 最小运行时镜像
# ============================================================================
FROM node:${NODE_VERSION}-slim AS runner
ARG PNPM_VERSION

WORKDIR /app

# 运行时系统依赖: curl 用于 HEALTHCHECK, sqlite3 用于调试
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# 非 root 用户运行
RUN groupadd --system --gid ${APP_GID} reup \
    && useradd --system --uid ${APP_UID} --gid reup --create-home --shell /bin/bash reup

# 复制生产依赖 (从 deps 阶段剔除 devDependencies)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/prisma/generated ./prisma/generated

# 数据: skill-vectors.json (27MB, 已在仓库) + skills.json + book-sources
COPY --from=builder /app/data ./data

# 入口脚本
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 运行时目录: 数据库 + 模型缓存挂载点
# /mnt/workspace 是 ModelScope 唯一持久化目录; /app/data 供 fly.io/compose volume 挂载
RUN mkdir -p /app/data /app/.cache/hub /app/.cache/tmp \
    /mnt/workspace/.cache/hub /mnt/workspace/.cache/tmp \
    && chown -R reup:reup /app

ENV NODE_ENV=production
ENV PORT=7860
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# better-sqlite3 数据库路径 (/mnt/workspace 是 ModelScope 唯一持久化目录)
ENV LOOP_ENGINEERING_DB=/mnt/workspace/loop-engineering.sqlite
# 向量索引 (镜像内已 bake, 只读)
ENV REUP_VECTORS_PATH=/app/data/skill-vectors.json
# @xenova/transformers 模型缓存目录 (/mnt/workspace 持久化避免冷启动重下)
ENV HF_HOME=/mnt/workspace/.cache/hub
ENV TRANSFORMERS_CACHE=/mnt/workspace/.cache/hub
ENV TMPDIR=/mnt/workspace/.cache/tmp

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]

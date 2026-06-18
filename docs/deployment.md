# ReUp 部署指南

ReUp 推荐通过 Docker Compose 一键部署。本文档覆盖从快速启动到生产加固的完整流程。

---

## 1. 前置条件

| 项 | 要求 | 说明 |
|----|------|------|
| Docker | 24+ | `docker --version` 验证 |
| Compose | v2 | `docker compose version` 验证（已内置 v2，无需单独装 `docker-compose`） |
| 内存 | ≥ 2 GB 空闲 | 模型缓存 + Next.js 运行时 |
| 磁盘 | ≥ 3 GB 可用 | 镜像 ~800 MB + 模型缓存 volume ~2.3 GB |
| 端口 | 5000 可用 | 宿主机映射端口，可通过 `REUP_PORT` 覆盖 |
| 网络 | 可访问 DashScope | LLM 调用走公网；首次启动需从 HuggingFace 拉模型 |

---

## 2. 快速开始

```bash
# 1. 准备环境变量
cp .env.local.example .env
# 编辑 .env，填入真实 DASHSCOPE_API_KEY

# 2. 构建并后台启动
make up

# 3. 健康检查（轻量探活）
make health

# 4. 访问
open http://localhost:5000
```

首次启动会下载 BGE-M3 + reranker 模型（~2.3 GB）到 `reup-models` volume，耗时取决于带宽；之后重启直接复用，冷启动 < 5s。

---

## 3. 配置项说明

所有配置通过 `.env` 文件注入（由 `docker-compose.yml` 读取）。

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `DASHSCOPE_API_KEY` | ✅ | — | 阿里云 DashScope API Key，从 [控制台](https://dashscope.console.aliyun.com/apiKey) 获取 |
| `DASHSCOPE_BASE_URL` | ❌ | `https://dashscope.aliyuncs.com/compatible-mode` | OpenAI 兼容模式端点 |
| `DASHSCOPE_CHAT_MODEL` | ❌ | `gui-plus-2026-02-26` | 对话模型名 |
| `DASHSCOPE_EMBEDDING_MODEL` | ❌ | `text-embedding-v3` | 向量嵌入模型名 |
| `LLM_PROVIDER` | ❌ | `dashscope` | LLM 提供商标识 |
| `REUP_PORT` | ❌ | `5000` | 宿主机映射端口（容器内固定 5000） |
| `REUP_DEBUG_PORT` | ❌ | `9229` | 开发模式 Node Inspector 调试端口 |
| `RESUME_PDF_LLM_FALLBACK` | ❌ | `false` | 简历解析规则法失败时是否回退 LLM，开启增加调用成本 |
| `COMPOSE_PROJECT_NAME` | ❌ | `reup` | Compose 项目名，多实例隔离时修改 |

> 镜像内端口、非 root 用户 UID/GID 也可在构建时通过 `--build-arg APP_PORT / APP_UID / APP_GID` 覆盖（见 `Dockerfile`），默认值与上表一致。

---

## 4. Makefile 命令

| 命令 | 用途 |
|------|------|
| `make build` | 构建镜像（`docker compose build`），不启动 |
| `make up` | 构建并后台启动（`up -d --build`） |
| `make down` | 停止并移除容器，**保留** volume 数据 |
| `make restart` | 重启容器（`restart`） |
| `make logs` | 跟踪查看日志（`logs -f reup`） |
| `make health` | 轻量健康检查（`curl /api/health`） |
| `make deep-health` | 深度健康检查（`curl /api/health?deep=1`，校验向量索引 + 数据库） |
| `make shell` | 进入运行中容器 shell（`exec reup sh`） |
| `make clean` | 停止并**清空** volume（`down -v`，慎用，数据不可恢复） |
| `make rebuild` | 无缓存重建镜像（`build --no-cache`），重建后需手动 `make up` |
| `make ps` | 查看容器状态（`compose ps`） |

---

## 5. 开发模式

开发模式通过 `docker-compose.override.yml` 自动合并到基础配置，无需手动指定：

- **自动合并**：`docker compose up` 会自动读取同目录的 `docker-compose.override.yml`，叠加开发配置（挂载源码、开启热重载、暴露调试端口）。
- **热重载**：源码目录以 volume 挂载进容器，文件改动触发 Next.js HMR / server 重启。
- **调试端口**：`REUP_DEBUG_PORT`（默认 9229）映射到容器 Node Inspector，用 Chrome `chrome://inspect` 或 VS Code attach 调试。
- **进入容器**：`make shell` 在运行中的容器内开 bash，便于排查。
- **跳过 override**：生产构建/部署时用 `PROD=1 make up`，Compose 会忽略 override 文件，仅用生产配置。

---

## 6. 数据持久化

两个命名 volume 由 `docker-compose.yml` 声明，跨容器重启保留：

| Volume | 挂载点 | 内容 | 首次大小 |
|--------|--------|------|----------|
| `reup-db` | `/app/data` | SQLite 数据库（会话 / 反馈 / 评估） | 几 KB 起步 |
| `reup-models` | `/app/.cache` | BGE-M3 (~2 GB) + reranker (~250 MB) 模型缓存 | ~2.3 GB |

### 备份

```bash
# 备份数据库 volume
docker run --rm -v reup-db:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/reup-db-$(date +%F).tar.gz -C /data .

# 备份模型缓存 volume（体积大，按需）
docker run --rm -v reup-models:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/reup-models-$(date +%F).tar.gz -C /data .
```

### 恢复

```bash
docker run --rm -v reup-db:/data -v "$(pwd)":/backup alpine \
  tar xzf /backup/reup-db-YYYY-MM-DD.tar.gz -C /data
```

> 多实例部署时，volume 名会带 `COMPOSE_PROJECT_NAME` 前缀（如 `myproj_reup-db`），备份命令需相应替换。

---

## 7. 健康检查

| 端点 | 用途 | 响应 |
|------|------|------|
| `GET /api/health` | 轻量探活 | 进程状态 + uptime，毫秒级返回 |
| `GET /api/health?deep=1` | 深度检查 | 额外校验向量索引文件可读 + 数据库文件可访问 |

容器内置 `HEALTHCHECK` 每 30s 调用一次轻量端点，`docker ps` 的 STATUS 列会显示 `healthy`。负载均衡 / K8s 探针建议用轻量端点做存活检查，部署后用深度端点做一次就绪验证。

```bash
make health        # 轻量
make deep-health   # 深度
```

---

## 8. 故障排查

### 端口冲突
```
Bind for 0.0.0.0:5000 failed: port is already allocated
```
修改 `.env` 中 `REUP_PORT=5001`（或其他空闲端口），`make down && make up`。注意只改宿主机映射端口，容器内始终监听 5000。

### Volume 权限问题
```
Error: EACCES: permission denied, open '/app/data/loop-engineering.sqlite'
```
容器内非 root 用户 UID/GID 默认 1001。若宿主目录以 bind mount 挂载且属主不是 1001，会写不进去。两种解法：
- 改宿主目录属主：`sudo chown -R 1001:1001 ./data`
- 构建时对齐 UID：`docker compose build --build-arg APP_UID=$(id -u) --build-arg APP_GID=$(id -g)`

### 模型冷启动慢
首次启动下载 ~2.3 GB 模型，`make logs` 会看到下载进度。若网络慢：
- 确认 `reup-models` volume 已正确挂载（下载一次后复用）
- 可在带宽好的机器先跑一次 `make up`，再 `docker volume` 迁移

### Prisma migrate 失败
```
[entrypoint] ERROR: prisma migrate deploy failed
```
容器入口脚本 `docker-entrypoint.sh` 在启动 server 前跑 `prisma migrate deploy`，失败即退出（fail-fast，避免 schema 漂移）。排查：
- `make logs` 看具体报错
- `make shell` 进容器手动 `pnpm prisma migrate status`
- 确认 `prisma/migrations` 目录与 `prisma/schema.prisma` 一致；当前项目用 schema-first，无迁移文件时会自动跳过此步

---

## 9. 生产建议

### 反向代理（Nginx）
在容器前加 Nginx 做 TLS 终止 + SSE 透传：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 必需：禁用缓冲，支持流式聊天
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

### 重启策略
`docker-compose.yml` 已设 `restart: unless-stopped`，宿主机重启后容器自动拉起，手动 `make down` 后不会自启。

### 日志轮转
已配置 `json-file` 驱动，单文件 10 MB、最多 3 个，避免日志撑爆磁盘：

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

### 多实例隔离
同一宿主机跑多套 ReUp 时，用 `COMPOSE_PROJECT_NAME` 隔离容器名与 volume：

```bash
# 实例 A
COMPOSE_PROJECT_NAME=reup-a REUP_PORT=5001 make up

# 实例 B
COMPOSE_PROJECT_NAME=reup-b REUP_PORT=5002 make up
```

各自独立的 `reup-a_reup-db` / `reup-b_reup-db` volume，互不干扰。

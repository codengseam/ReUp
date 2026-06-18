# AI Chat Scaffold 使用指南

## 1. 简介

这是一个零代码复用的 AI Chat 脚手架。你可以通过 **Docker** 或 **loop（本地）** 两种模式一键启动，无需修改 `src/` 源码即可复用到自己的项目。

## 2. 前置条件

- **Docker 模式**：Docker 24+、Docker Compose v2
- **loop 模式**：Node.js 20+、pnpm 9+

## 3. Docker 一键启动

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入你的 DASHSCOPE_API_KEY
make up
make health
```

## 4. loop 本地一键启动

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入你的 DASHSCOPE_API_KEY
./scripts/loop-install.sh
./scripts/loop-start.sh
```

## 5. 零代码复用指南

1. 复制本仓库到新项目目录。
2. 修改 `.env.local` 中的 `DASHSCOPE_API_KEY`。
3. 替换 `data/skills.json` 定义你的 skills。
4. 替换 `data/skill-vectors.json`，或放入你的知识库文档后运行重建脚本生成向量。
5. 不需要改 `src/` 里的任何代码。

## 6. Makefile 命令表

| 命令 | 说明 |
|---|---|
| `make build` | 构建镜像或应用 |
| `make up` | 启动服务（开发模式自动加载 override，支持热重载） |
| `make down` | 停止并移除容器 |
| `make restart` | 重启服务 |
| `make logs` | 查看容器日志 |
| `make health` | 健康检查 |
| `make deep-health` | 深度健康检查 |
| `make shell` | 进入容器 Shell |
| `make clean` | 停止并删除容器与数据卷（会丢失持久化数据，慎用） |
| `make rebuild` | 重新构建并启动 |
| `make ps` | 查看运行中的容器状态 |

## 7. 开发模式

`make up` 会自动加载 `docker-compose.override.yml`，启用热重载，并暴露调试端口 `9229`。

## 8. 生产模式

```bash
PROD=1 make up
```

生产模式会排除 `docker-compose.override.yml`，使用精简、稳定的配置。

## 9. 数据持久化

- **Docker 模式**：通过 Docker volume 持久化 `data/` 目录。
- **loop 模式**：直接使用本地 `data/` 目录，SQLite 数据库与缓存默认都保存在其中。

## 10. 故障排查

| 现象 | 排查方法 |
|---|---|
| 端口冲突 | 检查 `PORT` / `REUP_PORT` 是否被占用，或修改 `.env.local` |
| 权限不足 | 确保当前用户对 `data/` 有读写权限 |
| 模型下载慢 | 设置 `HF_HOME` / `TRANSFORMERS_CACHE` 到国内镜像或本地缓存目录 |
| 启动后无 RAG 结果 | 确认 `data/skill-vectors.json` 存在且与 `data/skills.json` 匹配 |

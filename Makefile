# Makefile — ReUp Docker 部署脚手架
# 封装常用 docker compose 命令, 开发/生产统一入口
#
# 用法:
#   make up           # 开发环境启动 (自动加载 docker-compose.override.yml)
#   make up PROD=1    # 生产环境启动 (显式排除 override)
#   make logs         # 跟踪日志
#   make health       # 轻量健康检查
#   make help         # 查看所有目标

# ---- 顶部变量 ----
COMPOSE := docker compose
SERVICE ?= reup
PORT ?= 5000

# PROD=1 时显式用 -f docker-compose.yml 排除 override
# PROD 为空时 COMPOSE_FILES 为空, compose 自动加载 docker-compose.override.yml
COMPOSE_FILES :=
ifeq ($(PROD),1)
COMPOSE_FILES := -f docker-compose.yml
endif

# ---- 目标 ----
.PHONY: build up down restart logs health deep-health shell clean rebuild ps help

help: ## 打印所有目标说明
	@echo "ReUp Docker 部署命令"
	@echo ""
	@echo "用法: make <target> [PROD=1] [PORT=5000] [SERVICE=reup]"
	@echo ""
	@echo "目标:"
	@echo "  build        构建镜像 (PROD=1 时不加载 override)"
	@echo "  up           构建并后台启动 (up -d --build)"
	@echo "  down         停止并移除容器 (保留 volume)"
	@echo "  restart      重启服务"
	@echo "  logs         跟踪日志 (logs -f)"
	@echo "  health       轻量健康检查 /api/health, 成功打印 OK"
	@echo "  deep-health  深度健康检查 /api/health?deep=1"
	@echo "  shell        进入容器 shell (exec <service> sh)"
	@echo "  clean        停止并删除 volume (down -v), 数据将丢失"
	@echo "  rebuild      无缓存重建 (build --no-cache)"
	@echo "  ps           查看容器状态"
	@echo "  help         打印此帮助"
	@echo ""
	@echo "环境变量:"
	@echo "  PROD=1       生产模式, 显式 -f docker-compose.yml 排除 override"
	@echo "  PORT=5000    健康检查端口 (对应 REUP_PORT)"
	@echo "  SERVICE=reup 目标服务名 (与 docker-compose.yml 一致)"

build: ## 构建镜像 (PROD=1 时不加载 override)
	$(COMPOSE) $(COMPOSE_FILES) build

up: ## 构建并后台启动
	$(COMPOSE) $(COMPOSE_FILES) up -d --build

down: ## 停止并移除容器 (保留 volume)
	$(COMPOSE) $(COMPOSE_FILES) down

restart: ## 重启服务
	$(COMPOSE) $(COMPOSE_FILES) restart

logs: ## 跟踪日志
	$(COMPOSE) $(COMPOSE_FILES) logs -f

health: ## 轻量健康检查, 成功打印 OK
	@curl -fsS http://localhost:$(PORT)/api/health && echo "OK"

deep-health: ## 深度健康检查
	@curl -fsS "http://localhost:$(PORT)/api/health?deep=1"

shell: ## 进入容器 shell
	$(COMPOSE) $(COMPOSE_FILES) exec $(SERVICE) sh

clean: ## 停止并删除 volume
	@echo "警告: 将删除所有数据"
	$(COMPOSE) $(COMPOSE_FILES) down -v

rebuild: ## 无缓存重建
	$(COMPOSE) $(COMPOSE_FILES) build --no-cache

ps: ## 查看容器状态
	$(COMPOSE) $(COMPOSE_FILES) ps

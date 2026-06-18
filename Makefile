COMPOSE := docker compose
SERVICE ?= ai-chat

# 从 .env.local 加载 REUP_PORT 等变量，使 compose 端口映射与 make health 一致
ifneq (,$(wildcard .env.local))
	include .env.local
	export
endif

HOST_PORT := $(or $(REUP_PORT),5000)

ifeq ($(PROD),1)
	COMPOSE_FILES := -f docker-compose.yml
else
	COMPOSE_FILES :=
endif

.PHONY: help build up down restart logs health deep-health shell clean rebuild ps env-check

env-check: ## 检查 .env.local 是否存在，不存在则从 example 创建
	@if [ ! -f .env.local ]; then \
		echo ".env.local 不存在，已从 .env.local.example 创建。请先编辑并填入 DASHSCOPE_API_KEY 等真实配置。"; \
		cp .env.local.example .env.local; \
	fi

help: ## 显示帮助信息（默认目标）
	@echo "AI Chat Docker 部署工具"
	@echo ""
	@echo "常用命令："
	@echo "  make build        构建 Docker 镜像"
	@echo "  make up           启动服务（开发模式，默认会加载 docker-compose.override.yml）"
	@echo "  make up PROD=1    启动服务（生产模式，仅使用 docker-compose.yml）"
	@echo "  make down         停止服务"
	@echo "  make restart      重启服务"
	@echo "  make logs         查看日志"
	@echo "  make health       检查服务健康状态"
	@echo "  make deep-health  深度健康检查（包含向量和数据库文件）"
	@echo "  make shell        进入运行中的容器"
	@echo "  make clean        停止并删除容器与数据卷（会丢失数据，慎用）"
	@echo "  make rebuild      重新构建镜像并启动"
	@echo "  make ps           查看容器状态"

build: ## 构建 Docker 镜像
	$(COMPOSE) $(COMPOSE_FILES) build $(SERVICE)

up: env-check ## 启动服务
	$(COMPOSE) $(COMPOSE_FILES) up -d $(SERVICE)

down: ## 停止服务
	$(COMPOSE) $(COMPOSE_FILES) down

restart: ## 重启服务
	$(COMPOSE) $(COMPOSE_FILES) restart $(SERVICE)

logs: ## 查看日志
	$(COMPOSE) $(COMPOSE_FILES) logs -f $(SERVICE)

health: ## 检查服务健康状态
	curl -fsS http://localhost:$(HOST_PORT)/api/health && echo OK

deep-health: ## 深度健康检查
	curl -fsS "http://localhost:$(HOST_PORT)/api/health?deep=1"

shell: ## 进入运行中的容器
	$(COMPOSE) $(COMPOSE_FILES) exec $(SERVICE) sh

clean: ## 停止并删除容器与数据卷（会丢失数据，慎用）
	@echo "警告：此操作将删除容器和数据卷，所有持久化数据将丢失！"
	$(COMPOSE) $(COMPOSE_FILES) down -v

rebuild: env-check ## 重新构建镜像并启动
	$(COMPOSE) $(COMPOSE_FILES) down
	$(COMPOSE) $(COMPOSE_FILES) build --no-cache $(SERVICE)
	$(COMPOSE) $(COMPOSE_FILES) up -d $(SERVICE)

ps: ## 查看容器状态
	$(COMPOSE) $(COMPOSE_FILES) ps

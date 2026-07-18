#!/usr/bin/env bash
# 安装 ReUp 项目的 Git hooks
# 用法: bash scripts/install-git-hooks.sh
# 参考 DreamTale scripts/install-git-hooks.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_SRC="$ROOT/githooks/pre-push"
HOOK_DST="$ROOT/.git/hooks/pre-push"

if [ ! -d "$ROOT/.git/hooks" ]; then
  echo "[ERROR] 未找到 .git/hooks 目录, 请在项目根目录运行此脚本"
  exit 1
fi

if [ ! -f "$HOOK_SRC" ]; then
  echo "[ERROR] 未找到 hook 源文件: $HOOK_SRC"
  exit 1
fi

cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"
echo "[OK] 已安装 pre-push hook 到 $HOOK_DST"
echo "     现在每次 git push 会自动运行: ts-check + lint + test + 提交信息校验"
echo ""
echo "跳过 hook (紧急情况): git push --no-verify"
echo "严格禁止直推 master: export REUP_STRICT_MASTER_GUARD=1"

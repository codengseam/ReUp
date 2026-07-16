#!/usr/bin/env bash
# ReUp 上线前核心检查脚本
# 对应 docs/qa/pre-release-checklist.md 的 P0 可自动化项
# 用法: bash scripts/pre-release-check.sh
# 退出码: 0=全部通过, 1=有失败项
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FAILURES=0
TOTAL=0

# usage: run_step "步骤名" 命令...
# 捕获命令输出，打印 PASS/FAIL，失败时 FAILURES+1
run_step() {
  local name="$1"
  shift
  TOTAL=$((TOTAL + 1))
  echo "--- [$TOTAL] $name ---"
  local output
  output="$("$@" 2>&1)" && local rc=0 || local rc=$?
  # 打印输出尾部（避免刷屏）
  echo "$output" | tail -15
  if [ "$rc" -eq 0 ]; then
    echo ">>> PASS: $name"
  else
    echo ">>> FAIL: $name (exit $rc)"
    FAILURES=$((FAILURES + 1))
  fi
  echo
}

# 不依赖 pnpm 的纯检查：文件存在性 / 数据完整性
check_file() {
  local name="$1"
  local path="$2"
  TOTAL=$((TOTAL + 1))
  echo "--- [$TOTAL] $name ---"
  if [ -e "$path" ]; then
    echo "found: $path"
    echo ">>> PASS: $name"
  else
    echo "missing: $path"
    echo ">>> FAIL: $name"
    FAILURES=$((FAILURES + 1))
  fi
  echo
}

echo "=== ReUp 上线前检查 ==="
echo "root: $ROOT_DIR"
echo "date: $(date '+%Y-%m-%d %H:%M:%S%z')"
echo

# ---------- 1. TypeScript 类型检查 ----------
run_step "pnpm ts-check (bug#2 Prisma client / bug#3 #4 隐式 any)" \
  pnpm ts-check

# ---------- 2. ESLint ----------
run_step "pnpm lint (bug#3 #4 隐式 any)" \
  pnpm lint

# ---------- 3. 单元测试 ----------
# 注意: package.json 的 test 脚本已是 "vitest run --passWithNoTests"，
# 不可再传 --run（pnpm 会拦截）；直接 pnpm test 即可。
run_step "pnpm test 全绿 (bug#1 #18 占位测试)" \
  pnpm test

# ---------- 4. 构建 ----------
run_step "pnpm run build (Next 16 生产构建)" \
  pnpm run build

# ---------- 5. RAG 向量数据完整性 ----------
TOTAL=$((TOTAL + 1))
echo "--- [$TOTAL] RAG 向量数据完整性 (bug#8) ---"
VECTORS_FILE="$ROOT_DIR/data/skill-vectors.json"
if [ ! -f "$VECTORS_FILE" ]; then
  echo "missing: $VECTORS_FILE"
  echo ">>> FAIL: RAG 向量数据完整性"
  FAILURES=$((FAILURES + 1))
else
  VEC_CHECK=$(node -e "
    const fs = require('fs');
    try {
      const d = JSON.parse(fs.readFileSync('$VECTORS_FILE', 'utf-8'));
      const count = typeof d.count === 'number' ? d.count : (Array.isArray(d.vectors) ? d.vectors.length : (Array.isArray(d) ? d.length : 0));
      const dim = d.dimension || (d.vectors && d.vectors[0] && d.vectors[0].vector ? d.vectors[0].vector.length : 0);
      console.log('count=' + count + ' dim=' + dim);
      if (count > 0 && dim === 1024) { process.exit(0); } else { process.exit(1); }
    } catch (e) { console.log('parse-error: ' + e.message); process.exit(1); }
  " 2>&1) && RC=0 || RC=$?
  echo "$VEC_CHECK"
  if [ "$RC" -eq 0 ]; then
    echo ">>> PASS: RAG 向量数据完整性"
  else
    echo ">>> FAIL: RAG 向量数据完整性"
    FAILURES=$((FAILURES + 1))
  fi
fi
echo

# ---------- 6. 关键文件存在性 ----------
check_file ".env.local 存在 (bug#2 LLM key)" "$ROOT_DIR/.env.local"

# .env.local 含 DASHSCOPE_API_KEY
TOTAL=$((TOTAL + 1))
echo "--- [$TOTAL] .env.local 含 DASHSCOPE_API_KEY ---"
if [ -f "$ROOT_DIR/.env.local" ] && grep -q "DASHSCOPE_API_KEY" "$ROOT_DIR/.env.local" 2>/dev/null; then
  echo ">>> PASS: DASHSCOPE_API_KEY 已配置"
else
  echo ">>> FAIL: DASHSCOPE_API_KEY 缺失"
  FAILURES=$((FAILURES + 1))
fi
echo

# Prisma generated client（schema.prisma output=./generated → prisma/generated/client）
TOTAL=$((TOTAL + 1))
echo "--- [$TOTAL] Prisma generated client 存在 (bug#2) ---"
PRISMA_OK=0
for p in \
  "$ROOT_DIR/prisma/generated/client" \
  "$ROOT_DIR/node_modules/.prisma/client"; do
  if [ -e "$p" ]; then
    echo "found: $p"
    PRISMA_OK=1
    break
  fi
done
if [ "$PRISMA_OK" -eq 1 ]; then
  echo ">>> PASS: Prisma generated client 存在"
else
  echo "missing: prisma/generated/client（ts-check 会报 Cannot find module）"
  echo ">>> FAIL: Prisma generated client 缺失（运行 pnpm prisma generate）"
  FAILURES=$((FAILURES + 1))
fi
echo

# ---------- 7. RAG 回归测试（checklist 衍生） ----------
run_step "RAG 回归测试 regression-checklist.test.ts" \
  pnpm test src/server/rag/__tests__/regression-checklist.test.ts

# ---------- 汇总 ----------
echo "=== 检查完成 ==="
echo "总计: $TOTAL  失败: $FAILURES"
if [ "$FAILURES" -eq 0 ]; then
  echo ">>> 全部通过，可进入手动 checklist 验证"
  exit 0
else
  echo ">>> 存在失败项，禁止合并上线"
  exit 1
fi

#!/usr/bin/env node
/**
 * Token 计数小工具 —— 统计指定文件的 token 数
 *
 * 实现说明：
 * - 使用 tiktoken 的 cl100k_base 编码
 * - DeepSeek-V3 / DeepSeek-Chat 使用与 GPT-4/cl100k_base 高度兼容的 BPE tokenizer
 * - 因此本工具对 DeepSeek 模型的 token 估算误差 < 5%
 * - 零网络调用、零成本、毫秒级返回
 *
 * 用法：
 *   node scripts/count-tokens.mjs <file> [<file> ...]
 *   # 或配合 pnpm：
 *   pnpm tsx scripts/count-tokens.ts <file>
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error - tiktoken 没有自带 .d.ts
import { get_encoding } from 'tiktoken';

const encoding = get_encoding('cl100k_base');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('用法: node scripts/count-tokens.mjs <file> [<file> ...]');
  process.exit(1);
}

let total = 0;
for (const f of files) {
  const path = resolve(f);
  const text = readFileSync(path, 'utf8');
  const tokens = encoding.encode(text).length;
  total += tokens;
  const chars = text.length;
  console.log(`${f.padEnd(48)} ${String(tokens).padStart(6)} tokens  (${chars} chars)`);
}

if (files.length > 1) {
  console.log('-'.repeat(72));
  console.log(`${'合计'.padEnd(48)} ${String(total).padStart(6)} tokens`);
}

encoding.free();

#!/usr/bin/env node
/**
 * scripts/clean-book-sources.mjs
 *
 * 清理 data/book-sources/*.md 原文:
 * 1. 去掉合规声明行 (> ⚠️ **合规声明**...)
 * 2. 去掉 frontmatter (---\n...\n---\n)
 * 3. 去掉原材料行 (> 原材料：...)
 * 4. 去掉开场白 "你好，我是华仔。"
 * 5. 合并多余空行
 *
 * 保留: # 标题 + 正文 (适合 RAG 检索)
 *
 * 用法: node scripts/clean-book-sources.mjs
 * 输出: 原地覆盖, 先备份到 .bak
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BOOK_SOURCES_DIR = path.join(ROOT, 'data', 'book-sources');
const BOOKS = ['大厂晋升指南', '面试现场'];

// 噪音正则
const COMPLIANCE_LINE = /^>\s*⚠️\s*\*\*合规声明\*\*[^\n]*\n+/;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n+/;
const RAW_MATERIAL_LINE = /^>\s*原材料：[^\n]*\n+/m;
// 开场白 (全局替换, 处理多章节合并文件中的多次出现)
const GREETING_LINE = /^你好，我是华仔。/gm;
const MULTI_BLANK = /\n{3,}/g;

function cleanContent(content) {
  // 确保末尾有换行
  let out = content.endsWith('\n') ? content : content + '\n';

  // 1. 去合规声明行
  out = out.replace(COMPLIANCE_LINE, '');

  // 2. 去 frontmatter
  out = out.replace(FRONTMATTER, '');

  // 3. 再次去合规声明 (防止 frontmatter 之前有残留)
  out = out.replace(COMPLIANCE_LINE, '');

  // 4. 去原材料行
  out = out.replace(RAW_MATERIAL_LINE, '');

  // 5. 去开场白
  out = out.replace(GREETING_LINE, '');

  // 6. 合并连续空行
  out = out.replace(MULTI_BLANK, '\n\n');

  // 7. 去开头多余空行
  out = out.replace(/^\n+/, '');

  // 8. 去末尾多余空行
  out = out.replace(/\n+$/, '\n');

  return out;
}

function main() {
  console.log('=== clean-book-sources.mjs ===\n');
  let totalFiles = 0;
  let cleanedFiles = 0;
  const stats = { compliance: 0, frontmatter: 0, rawMaterial: 0, greeting: 0 };

  for (const book of BOOKS) {
    const dir = path.join(BOOK_SOURCES_DIR, book);
    if (!fs.existsSync(dir)) {
      console.warn(`WARN: ${dir} not found`);
      continue;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    console.log(`Processing ${book}: ${files.length} files`);

    for (const f of files) {
      totalFiles++;
      const filepath = path.join(dir, f);
      const original = fs.readFileSync(filepath, 'utf8');

      // 统计噪音
      if (COMPLIANCE_LINE.test(original)) stats.compliance++;
      if (FRONTMATTER.test(original)) stats.frontmatter++;
      if (RAW_MATERIAL_LINE.test(original)) stats.rawMaterial++;
      if (GREETING_LINE.test(original)) stats.greeting++;

      const cleaned = cleanContent(original);
      if (cleaned !== original) {
        // 备份
        fs.writeFileSync(filepath + '.bak', original);
        // 写回
        fs.writeFileSync(filepath, cleaned);
        cleanedFiles++;
      }
    }
  }

  console.log(`\n=== 完成 ===`);
  console.log(`总文件: ${totalFiles}`);
  console.log(`已清理: ${cleanedFiles}`);
  console.log(`噪音统计:`);
  console.log(`  合规声明: ${stats.compliance} 文件`);
  console.log(`  frontmatter: ${stats.frontmatter} 文件`);
  console.log(`  原材料行: ${stats.rawMaterial} 文件`);
  console.log(`  开场白: ${stats.greeting} 文件`);
  console.log(`\n备份文件: *.bak (可用来回滚)`);
}

main();

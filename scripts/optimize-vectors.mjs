#!/usr/bin/env node
/**
 * scripts/optimize-vectors.mjs
 *
 * 优化 data/skill-vectors.json：
 * 1. 元数据重映射：通过 frontmatter id 把老 filename/section_title/doc_title/title_path
 *    映射到 book-sources 的新命名（"第9章优化版" → "职级详解（业务整体+小团队）"）
 * 2. text 去噪：去掉每个 chunk 的合规声明前缀 + frontmatter + "原材料"行 + 固定开场白
 * 3. 保留 vector + sparse_vector + id + chunk_index + book 不变
 *    （环境无法重算 BGE-M3，轻度清理不改变语义主题，向量仍有效）
 *
 * 用法：node scripts/optimize-vectors.mjs
 * 输出：data/skill-vectors.json (原地覆盖，先备份为 .bak)
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VECTORS_FILE = path.join(ROOT, 'data', 'skill-vectors.json');
const BOOK_SOURCES_DIR = path.join(ROOT, 'data', 'book-sources');
const BOOKS = ['大厂晋升指南', '面试现场'];

// ============================================================================
// Step 1: 建立 id → 新命名 映射表
// ============================================================================
function buildIdMap() {
  const idMap = {};
  for (const book of BOOKS) {
    const dir = path.join(BOOK_SOURCES_DIR, book);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const idMatch = content.match(/^id:\s*(\S+)/m);
      const titleMatch = content.match(/^title:\s*(.+)/m);
      if (idMatch) {
        idMap[idMatch[1]] = {
          newFilename: f,
          newTitle: (titleMatch?.[1]?.trim() || f.replace(/\.md$/, '')),
          book,
        };
      }
    }
  }
  return idMap;
}

// ============================================================================
// Step 2: text 清理
// ============================================================================
// 合规声明行（只匹配那一行 + 紧跟的空行，不吃掉 ---）
const COMPLIANCE_LINE = /^>\s*⚠️\s*\*\*合规声明\*\*[^\n]*\n+/;
// frontmatter 块：---\n...\n---\n
const FRONTMATTER = /^---\n[\s\S]*?\n---\n+/;
// 原材料行（多行模式，匹配任意位置的行首）
const RAW_MATERIAL_LINE = /^>\s*原材料：[^\n]*\n+/m;
// 开场白（多行模式，匹配行首的"你好，我是华仔。"，不管后面跟什么）
const GREETING_LINE = /^你好，我是华仔。/m;
// 连续空行合并
const MULTI_BLANK = /\n{3,}/g;

function cleanText(text, oldTitle, newTitle) {
  // 确保末尾有换行，避免行尾正则匹配失败
  let out = text.endsWith('\n') ? text : text + '\n';

  // 1. 去合规声明行（只去那一行 + 空行）
  out = out.replace(COMPLIANCE_LINE, '');

  // 2. 去 frontmatter（---\n...\n---\n）
  out = out.replace(FRONTMATTER, '');

  // 3. 再次去合规声明（防止 frontmatter 之前有残留）
  out = out.replace(COMPLIANCE_LINE, '');

  // 4. 去 "原材料：xxx" 行（多行模式，匹配任意位置）
  out = out.replace(RAW_MATERIAL_LINE, '');

  // 5. 替换老标题 → 新标题（# 标题行）
  if (oldTitle && newTitle && oldTitle !== newTitle) {
    const titleRegex = new RegExp(
      '^#\\s+' + escapeRegex(oldTitle) + '\\s*$',
      'm'
    );
    out = out.replace(titleRegex, `# ${newTitle}`);
  }

  // 6. 去固定开场白 "你好，我是华仔。"（多行模式，只去前缀）
  out = out.replace(GREETING_LINE, '');

  // 7. 合并连续空行（最多保留 2 个换行）
  out = out.replace(MULTI_BLANK, '\n\n');

  // 8. 去掉开头多余空行
  out = out.replace(/^\n+/, '');

  // 9. 去掉末尾多余空行
  out = out.replace(/\n+$/, '\n');

  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Step 3: 主流程
// ============================================================================
function main() {
  console.log('Loading vectors...');
  const raw = fs.readFileSync(VECTORS_FILE, 'utf8');
  const data = JSON.parse(raw);

  console.log('Building id map from book-sources...');
  const idMap = buildIdMap();
  console.log(`  idMap entries: ${Object.keys(idMap).length}`);

  // 备份
  const bakPath = VECTORS_FILE + '.bak';
  fs.writeFileSync(bakPath, raw);
  console.log(`Backup written: ${bakPath}`);

  // 先建立 filename → frontmatterId 映射（只有 chunk_index=0 的 chunk 有 frontmatter）
  const filenameToId = {};
  for (const v of data.vectors) {
    if (v.chunk_index === 0) {
      const idMatch = v.text.match(/^id:\s*(\S+)/m);
      if (idMatch) filenameToId[v.filename] = idMatch[1];
    }
  }
  console.log(`  filenameToId entries: ${Object.keys(filenameToId).length}`);

  let updated = 0;
  let skipped = 0;
  let textCleaned = 0;
  const errors = [];

  for (let i = 0; i < data.vectors.length; i++) {
    const v = data.vectors[i];
    try {
      // 通过 filename 查 frontmatter id
      const fmId = filenameToId[v.filename];
      if (!fmId) {
        errors.push(`chunk ${i}: no frontmatter id for filename ${v.filename}`);
        skipped++;
        continue;
      }
      const mapping = idMap[fmId];
      if (!mapping) {
        errors.push(`chunk ${i}: id ${fmId} not found in book-sources`);
        skipped++;
        continue;
      }

      const { newFilename, newTitle, book } = mapping;
      const oldFilename = v.filename;
      const oldTitle = v.section_title;

      // 记录原始 text 长度
      const oldTextLen = v.text.length;

      // --- 更新元数据 ---
      v.filename = newFilename;
      v.section_title = newTitle;
      v.doc_title = newTitle;
      v.title_path = newTitle;
      v.source_path = `${book}/${newFilename}`;
      v.book = book;

      // keyword_text: 用新标题 + 新文件名重建
      v.keyword_text = `${newTitle} ${newFilename} ${book} ${newTitle}`;

      // metadata (JSON string): parse → update → stringify
      let meta = {};
      try { meta = JSON.parse(v.metadata); } catch { meta = {}; }
      meta.filename = newFilename;
      meta.section_title = newTitle;
      meta.doc_title = newTitle;
      meta.title_path = newTitle;
      meta.source_path = `${book}/${newFilename}`;
      meta.book = book;
      v.metadata = JSON.stringify(meta);

      // --- 清理 text ---
      v.text = cleanText(v.text, oldTitle, newTitle);

      // --- 同步 retrieval_text ---
      // retrieval_text 是 text 的检索版本，做同样的清理
      v.retrieval_text = cleanText(v.retrieval_text, oldTitle, newTitle);

      // --- 如果清理后 text 为空（chunk_index=0 只有元数据的情况），
      //     用新标题填充，避免空内容污染检索结果 ---
      if (!v.text.trim()) {
        v.text = `# ${newTitle}`;
        v.retrieval_text = `# ${newTitle}`;
      }

      if (v.text.length !== oldTextLen) textCleaned++;
      updated++;
    } catch (err) {
      errors.push(`chunk ${i}: ${err.message}`);
      skipped++;
    }
  }

  // 更新顶层 source 元数据
  data.source = 'data/book-sources (optimized via scripts/optimize-vectors.mjs)';
  data.optimized_at = new Date().toISOString();

  // 写回
  fs.writeFileSync(VECTORS_FILE, JSON.stringify(data));
  const sizeMB = (fs.statSync(VECTORS_FILE).size / 1024 / 1024).toFixed(2);

  console.log('\n=== 优化结果 ===');
  console.log(`总 chunk: ${data.vectors.length}`);
  console.log(`成功更新: ${updated}`);
  console.log(`跳过: ${skipped}`);
  console.log(`text 被清理: ${textCleaned}`);
  console.log(`输出大小: ${sizeMB} MB`);
  if (errors.length) {
    console.log(`\n错误 (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.log('  ' + e));
  }
}

main();

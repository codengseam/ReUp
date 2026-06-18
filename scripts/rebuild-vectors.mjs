#!/usr/bin/env node
/**
 * scripts/rebuild-vectors.mjs
 *
 * 完整重建 data/skill-vectors.json：
 * 从 data/book-sources/ 重新 chunk + BGE-M3 embed + 导出 JSON。
 *
 * 与 optimize-vectors.mjs 的区别：
 * - optimize-vectors.mjs：只更新元数据 + 清理 text，保留老 vector（快速修复）
 * - rebuild-vectors.mjs：重新 chunk + 重新 embed，vector 与新 text 完全匹配（彻底重建）
 *
 * 前置条件（本地运行环境）：
 * 1. pnpm add @xenova/transformers  （首次需要）
 * 2. 首次运行会下载 BGE-M3 模型 (~2GB) 到 HF_HOME 缓存目录
 * 3. Node >= 18
 *
 * 用法：
 *   node scripts/rebuild-vectors.mjs
 *   node scripts/rebuild-vectors.mjs --chunk-size 800 --chunk-overlap 100
 *   node scripts/rebuild-vectors.mjs --dry-run  # 只 chunk 不 embed，验证切分
 *
 * 输出：data/skill-vectors.json (原地覆盖，先备份为 .bak)
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BOOK_SOURCES_DIR = path.join(ROOT, 'data', 'book-sources');
const OUTPUT_FILE = path.join(ROOT, 'data', 'skill-vectors.json');
const BOOKS = ['大厂晋升指南', '面试现场'];
const MODEL_ID = 'Xenova/bge-m3';
const EMBEDDING_DIM = 1024;

// 默认 chunk 参数（与原 LanceDB 切分接近）
const DEFAULT_CHUNK_SIZE = 800;   // 字符数
const DEFAULT_CHUNK_OVERLAP = 100;

// ============================================================================
// Step 1: 解析参数
// ============================================================================
function parseArgs() {
  const args = { chunkSize: DEFAULT_CHUNK_SIZE, chunkOverlap: DEFAULT_CHUNK_OVERLAP, dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--chunk-size' && argv[i+1]) { args.chunkSize = parseInt(argv[++i], 10); }
    else if (argv[i] === '--chunk-overlap' && argv[i+1]) { args.chunkOverlap = parseInt(argv[++i], 10); }
    else if (argv[i] === '--dry-run') { args.dryRun = true; }
  }
  return args;
}

// ============================================================================
// Step 2: 文本清理（去掉合规声明 + frontmatter + 原材料行 + 开场白）
// ============================================================================
const COMPLIANCE_LINE = /^>\s*⚠️\s*\*\*合规声明\*\*[^\n]*\n+/;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n+/;
const RAW_MATERIAL_LINE = /^>\s*原材料：[^\n]*\n+/m;
const GREETING_LINE = /^你好，我是华仔。/m;
const MULTI_BLANK = /\n{3,}/g;

function cleanMarkdown(content) {
  let out = content.endsWith('\n') ? content : content + '\n';
  out = out.replace(COMPLIANCE_LINE, '');
  out = out.replace(FRONTMATTER, '');
  out = out.replace(COMPLIANCE_LINE, '');
  out = out.replace(RAW_MATERIAL_LINE, '');
  out = out.replace(GREETING_LINE, '');
  out = out.replace(MULTI_BLANK, '\n\n');
  out = out.replace(/^\n+/, '');
  out = out.replace(/\n+$/, '\n');
  return out;
}

// ============================================================================
// Step 3: chunk 切分（按段落 + 长度）
// ============================================================================
function chunkText(text, chunkSize, overlap) {
  // 按段落切分（## 标题或空行）
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > chunkSize && current) {
      chunks.push(current.trim());
      // overlap: 保留上一 chunk 末尾
      if (overlap > 0) {
        const tail = current.slice(-overlap);
        current = tail + '\n\n' + para;
      } else {
        current = para;
      }
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ============================================================================
// Step 4: 提取标题
// ============================================================================
function extractTitle(content) {
  const titleMatch = content.match(/^title:\s*(.+)/m);
  return titleMatch?.[1]?.trim() || null;
}

function extractId(content) {
  const idMatch = content.match(/^id:\s*(\S+)/m);
  return idMatch?.[1] || null;
}

// ============================================================================
// Step 5: BGE-M3 embed
// ============================================================================
let pipeline = null;
async function getEmbedder() {
  if (pipeline) return pipeline;
  console.log(`Loading BGE-M3 model: ${MODEL_ID} (~2GB, first run downloads)...`);
  const moduleName = '@xenova/' + 'transformers';
  const mod = await import(moduleName);
  pipeline = await mod.pipeline('feature-extraction', MODEL_ID);
  console.log('Model loaded.');
  return pipeline;
}

async function embed(text, embedder) {
  if (!text.trim()) return new Array(EMBEDDING_DIM).fill(0);
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  // @xenova/transformers 返回 Tensor，转成普通数组
  const data = output.data || output.tolist?.() || output;
  return Array.from(data);
}

// ============================================================================
// Step 6: 主流程
// ============================================================================
async function main() {
  const args = parseArgs();
  console.log('=== rebuild-vectors.mjs ===');
  console.log(`chunkSize=${args.chunkSize}, overlap=${args.chunkOverlap}, dryRun=${args.dryRun}`);

  // 1. 扫描所有 book-sources 文件
  const allChunks = [];
  for (const book of BOOKS) {
    const dir = path.join(BOOK_SOURCES_DIR, book);
    if (!fs.existsSync(dir)) {
      console.warn(`WARN: ${dir} not found, skipping.`);
      continue;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    console.log(`Scanning ${book}: ${files.length} files`);

    for (const filename of files) {
      const filepath = path.join(dir, filename);
      const raw = fs.readFileSync(filepath, 'utf8');
      const id = extractId(raw);
      const title = extractTitle(raw) || filename.replace(/\.md$/, '');
      const cleaned = cleanMarkdown(raw);

      // 如果清理后为空，跳过
      if (!cleaned.trim()) {
        console.warn(`  WARN: ${filename} empty after cleaning, skipping.`);
        continue;
      }

      const textChunks = chunkText(cleaned, args.chunkSize, args.chunkOverlap);
      textChunks.forEach((chunkText, idx) => {
        allChunks.push({
          id: `${id || filename}-${idx}`,
          text: chunkText,
          retrieval_text: chunkText,
          metadata: JSON.stringify({
            book,
            filename,
            source_path: `${book}/${filename}`,
            doc_title: title,
            header_path: '/',
            header_titles: [],
            section_title: title,
            title_path: title,
            chunk_index: idx,
          }),
          book,
          filename,
          doc_title: title,
          section_title: title,
          title_path: title,
          keyword_text: `${title} ${filename} ${book} ${title}`,
          source_path: `${book}/${filename}`,
          chunk_index: idx,
          // vector + sparse_vector 稍后填充
          vector: null,
          sparse_vector: null,
        });
      });
    }
  }

  console.log(`\nTotal chunks: ${allChunks.length}`);

  if (args.dryRun) {
    console.log('\n=== DRY RUN (不 embed) ===');
    console.log('前 3 个 chunk 示例:');
    allChunks.slice(0, 3).forEach((c, i) => {
      console.log(`--- chunk ${i} ---`);
      console.log(`  filename: ${c.filename}`);
      console.log(`  section_title: ${c.section_title}`);
      console.log(`  chunk_index: ${c.chunk_index}`);
      console.log(`  text 前 100 字符: ${c.text.slice(0, 100)}`);
    });
    return;
  }

  // 2. Embed 所有 chunk
  const embedder = await getEmbedder();
  console.log(`\nEmbedding ${allChunks.length} chunks...`);
  for (let i = 0; i < allChunks.length; i++) {
    const c = allChunks[i];
    c.vector = await embed(c.text, embedder);
    // sparse_vector: BGE-M3 原生支持，但 @xenova/transformers 不直接暴露
    // 这里用空数组占位（运行时检索主要用 dense vector，sparse 权重 0.15）
    c.sparse_vector = [];
    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${allChunks.length} done`);
    }
  }
  console.log('Embedding complete.');

  // 3. 备份 + 写入
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.copyFileSync(OUTPUT_FILE, OUTPUT_FILE + '.bak');
    console.log(`Backup: ${OUTPUT_FILE}.bak`);
  }

  const payload = {
    version: 2,
    source: 'data/book-sources (rebuilt via scripts/rebuild-vectors.mjs)',
    table: 'boss_agent_knowledge',
    dimension: EMBEDDING_DIM,
    count: allChunks.length,
    rebuilt_at: new Date().toISOString(),
    vectors: allChunks,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload));
  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`\n=== 完成 ===`);
  console.log(`输出: ${OUTPUT_FILE}`);
  console.log(`chunks: ${allChunks.length}, dim: ${EMBEDDING_DIM}, size: ${sizeMB} MB`);
  console.log(`\n注意: sparse_vector 为空数组（@xenova/transformers 不暴露 BGE-M3 sparse 输出）。`);
  console.log(`      dense vector 检索不受影响，混合检索的 sparse 权重会降为 0。`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

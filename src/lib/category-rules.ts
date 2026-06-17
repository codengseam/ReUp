// src/lib/category-rules.ts
// ReUp v2 Phase 2: L2 chunk 主题分类规则表（单一事实源）
// Spec: docs/superpowers/specs/2026-06-15-knowledge-metadata-restructure-design.md §3.1
//
// 用法：
//   - `deriveCategory(record)` 根据 title_path + doc_title + section_title 命中第一条规则
//   - 兜底分类 `'通用'`，表示 chunk 没有更细的语义标签
//   - 规则按声明顺序匹配，命中后即返回（priority 相同时取先声明的）
//   - 第二层「doc_title hint」把每章封面/介绍页按章节主题归档（用于 hit-rate ≥ 95%）
//
// 框架通用化：规则表与 doc_title hint 映射已清空，由调用方基于自身知识库自行扩展。
// 框架只保留通用兜底逻辑（'通用'）。

// ---------------- 类型定义 ----------------

/**
 * L2 chunk 主题分类。
 * 框架通用化后类型放宽为 string，由调用方基于自身知识库自定义分类名。
 * 内置兜底分类为 '通用'。
 */
export type TopicCategory = string;

/**
 * 单条分类规则。匹配规则：任一 keyword 出现在拼接文本中即匹配。
 * `priority` 越大越优先匹配（用于同 chunk 命中多类时取更具体的那条）。
 */
export interface CategoryRule {
  /** 分类名 */
  category: TopicCategory;
  /** 关键词列表（中文短语 + 章节标识）；任一命中即匹配 */
  keywords: string[];
  /** 优先级；通用兜底用 -1 跳过主循环 */
  priority: number;
}

/**
 * chunk 的最小入参：仅依赖 3 个标题字段，不读 text/vector。
 * 字段全部 optional —— 缺失时退化为空串。
 */
export interface CategoryInput {
  title_path?: string;
  doc_title?: string;
  section_title?: string;
}

// ---------------- 规则表（按 spec §3.1 顺序） ----------------

/**
 * 分类规则表。
 * 框架通用化后清空，由调用方基于自身知识库自行注入规则。
 * 「通用」作为兜底，priority = -1 在 deriveCategory 中被跳过。
 */
export const CATEGORY_RULES: ReadonlyArray<CategoryRule> = [
  // -------- 兜底 --------
  { category: '通用', keywords: [], priority: -1 },
];

// ---------------- doc_title 兜底映射 ----------------

/**
 * doc_title 兜底映射。
 * 框架通用化后清空，由调用方基于自身知识库自行注入映射。
 */
export const PROMOTION_DOC_TITLE_HINTS: Readonly<Record<string, TopicCategory>> = {};

/**
 * doc_title 兜底映射。
 * 框架通用化后清空，由调用方基于自身知识库自行注入映射。
 */
export const INTERVIEW_DOC_TITLE_HINTS: Readonly<Record<string, TopicCategory>> = {};

// ---------------- 派生函数 ----------------

/**
 * 派生 chunk 的 category。
 *
 * 匹配流程：
 *   1) 拼接 title_path + doc_title + section_title
 *   2) 依次遍历 CATEGORY_RULES，跳过 priority < 0 的兜底规则；
 *      命中 keywords 的第一条直接返回其 category
 *   3) 关键词都没命中时，按 book 走 doc_title 兜底映射
 *      （PROMOTION_DOC_TITLE_HINTS / INTERVIEW_DOC_TITLE_HINTS）
 *   4) 都不命中 → '通用'
 *
 * 输入字段全部 optional；缺失时按空串处理，永不抛错。
 */
export function deriveCategory(record: CategoryInput): TopicCategory {
  const text = `${record.title_path ?? ''} ${record.doc_title ?? ''} ${record.section_title ?? ''}`;

  for (const r of CATEGORY_RULES) {
    if (r.priority < 0) continue;
    if (r.keywords.some((k) => text.includes(k))) {
      return r.category;
    }
  }

  if (record.doc_title) {
    if (record.doc_title in PROMOTION_DOC_TITLE_HINTS) {
      return PROMOTION_DOC_TITLE_HINTS[record.doc_title] as TopicCategory;
    }
    if (record.doc_title in INTERVIEW_DOC_TITLE_HINTS) {
      return INTERVIEW_DOC_TITLE_HINTS[record.doc_title] as TopicCategory;
    }
  }

  return '通用';
}

// ---------------- 默认导出（frozen 快照，供测试 import） ----------------

/** 冻结的默认导出快照，避免运行时被改。 */
const frozen = Object.freeze({
  CATEGORY_RULES,
  PROMOTION_DOC_TITLE_HINTS,
  INTERVIEW_DOC_TITLE_HINTS,
  deriveCategory,
});
export default frozen;

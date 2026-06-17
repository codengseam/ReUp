// src/lib/prompts/blocks.ts
// 通用可配置 System Prompt 模板。
//
// 框架只提供通用角色 / 约束 / 输出格式；领域特定内容（persona、skill 详情、
// 输出格式定制）由调用方通过 buildSystemPrompt(options) 覆盖，不在框架内硬编码。

/**
 * 通用角色块：基于知识库回答用户问题的 AI 助手。
 * 调用方可通过 buildSystemPrompt({ persona }) 覆盖为领域角色。
 */
export const DEFAULT_PERSONA_BLOCK = `你是一个基于知识库回答用户问题的 AI 助手。`;

/**
 * 通用工作方式约束块。
 * 保留框架级通用约束（基于知识库、引用原文、避免敏感话题等），不含领域特定限制。
 */
export const DEFAULT_CONSTRAINTS_BLOCK = `## 工作方式
1. 基于知识库：优先依据检索到的知识库内容回答，不臆造
2. 引用原文：引用知识库中的原文时用 [1][2] 编号标注出处
3. 简洁清晰：先给结论再展开说明
4. 避免：暴力/色情/仇恨/恐怖/政治/宗教/赌博/毒品/娱乐八卦/个人隐私/安全凭证`;

/**
 * 通用输出格式块：markdown 结构 + 引用编号。
 * 调用方可通过 buildSystemPrompt({ format }) 覆盖为领域专属格式。
 */
export const DEFAULT_FORMAT_BLOCK = `## 输出格式（严格遵守）
- 使用 markdown 结构化输出
- 引用知识库原文时用 [1][2] 编号标注出处
- 无相关知识时如实告知，不编造`;

export interface BuildSystemPromptOptions {
  /** 角色块，覆盖 DEFAULT_PERSONA_BLOCK */
  persona?: string;
  /** 输出格式块，覆盖 DEFAULT_FORMAT_BLOCK */
  format?: string;
  /** 具体 Skill / 领域详情（按 markdown 段落格式拼接），可选 */
  skillDetail?: string;
  /** 知识库检索结果拼好的 markdown 块（参考资料1/2/3...） */
  ragContext?: string;
  /** 敏感话题警告文本（中等风险时附加） */
  sensitiveWarning?: string;
}

/**
 * 聚合 System Prompt：PERSONA → 可选 SKILL_DETAIL → CONSTRAINTS → FORMAT → 可选 RAG 块 → 可选 WARNING 块。
 *
 * 所有 block 均可通过 options 覆盖；框架不硬编码任何领域内容。
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const parts: string[] = [options.persona ?? DEFAULT_PERSONA_BLOCK];
  if (options.skillDetail) {
    parts.push('', options.skillDetail);
  }
  parts.push('', DEFAULT_CONSTRAINTS_BLOCK, '', options.format ?? DEFAULT_FORMAT_BLOCK);
  if (options.ragContext) {
    parts.push('', `## 知识库检索结果\n严格基于以下内容回答：\n\n${options.ragContext}`);
  }
  if (options.sensitiveWarning) {
    parts.push('', `## 注意\n${options.sensitiveWarning}`);
  }
  return parts.join('\n');
}

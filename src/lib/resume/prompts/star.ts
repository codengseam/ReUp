// src/lib/resume/prompts/star.ts
// Phase 3 P0 — B2 STAR 改写 prompt 模板构造器
//
// 设计要点：
// - 纯函数：仅返回 { system, user } 字符串，不调 LLM。
// - System = 角色 + 8 Skills（来自 data/skills.json）+ Few-shot（来自 examples/）+
//
//   4 段输出格式。
// - User = 紧凑 JSON 简历 + 4 段分别重写指令。
// - 注入的 few-shot 数量通过 opts.exampleIds 控制（默认 ['example-1']）。
// - 估算 token 数（≈ 字符数 / 2，中英混排经验值），超出 MAX_PROMPT_TOKENS
//   时 console.warn 而非 throw（保证 B3 仍能跑，只是提示）。
// - ResumeDocument 类型从 A1 任务创建的 src/lib/resume/types.ts 导入并再导出。

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadSkillsSync } from '@/lib/skills-loader';
import type { ResumeDocument } from '../types';

// 重新导出，方便 B3 / 后续模块沿用同一类型
export type { ResumeDocument };

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/**
 * Few-shot example 结构（与 examples/*.json 字段对齐）。
 */
export interface StarExample {
  id: string;
  label: string;
  persona: {
    name: string;
    title: string;
    yearsOfExperience: number;
    company: string;
  };
  input: ResumeDocument;
  output: {
    我的分析: string;
    STAR改写: Record<string, Array<{
      situation: string;
      task: string;
      action: string;
      result: string;
    }>>;
    底层心法: string;
    建议: string;
  };
}

export interface BuildStarRewritePromptOptions {
  /** 要注入的 example id 列表；默认 ['example-1']；传 [] 表示不注入 */
  exampleIds?: string[];
}

/** Token 估算上限：超出仅 warn，不 throw */
export const MAX_PROMPT_TOKENS = 12000;

// ---------------------------------------------------------------------------
// 路径 / 加载工具
// ---------------------------------------------------------------------------

const SECTION_MARKERS = ['【我的分析】', '【STAR改写】', '【底层心法】', '【建议】'] as const;

/** 在 CommonJS / Vitest / Next 各种环境下都能拿到 __dirname */
function getExamplesDir(): string {
  // Vitest/Node ESM: fileURLToPath(import.meta.url)
  // Next / CJS: __dirname
  // 都尝试一次，fallback 到 process.cwd() 解析
  const candidates: string[] = [];
  try {
    if (typeof __dirname === 'string' && __dirname.length > 0) {
      candidates.push(join(__dirname, '..', 'examples'));
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      const here = dirname(fileURLToPath(import.meta.url));
      candidates.push(join(here, '..', 'examples'));
    }
  } catch {
    /* ignore */
  }
  for (const p of candidates) {
    if (existsSync(join(p, 'example-1.json'))) return p;
  }
  // 最后兜底：相对 cwd
  return join(process.cwd(), 'src', 'lib', 'resume', 'examples');
}

const EXAMPLES_DIR = getExamplesDir();

function loadExample(id: string): StarExample | null {
  const p = join(EXAMPLES_DIR, `${id}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as StarExample;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 渲染工具
// ---------------------------------------------------------------------------

/** 中英混排粗略 token 估算：≈ 字符数 / 2 */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 2);
}

/** 8 Skills 摘要块：保留 id / name / category / framework */
function renderSkillsBlock(): string {
  const skills = loadSkillsSync().skills;
  const lines: string[] = ['## 可调用的 8 个 Skills（按需引用，命名与本系统一致）'];
  for (const s of skills) {
    lines.push(`- [${s.name} / ${s.id} / ${s.category}] ${s.framework}`);
  }
  return lines.join('\n');
}

/** 4 段输出格式说明 */
const OUTPUT_FORMAT_BLOCK = `## 输出格式（严格遵守，按顺序输出 4 段，段名必须用以下中文标识）

【我的分析】
- 1-2 句对候选人定位与亮点的判断

【STAR改写】
- 对原始简历每一条 bullet，按 "Situation / Task / Action / Result" 四段重写
- 每段加粗关键词：*Situation* / *Task* / *Action* / *Result*
- 数字必须可验证（QPS / 延迟 / 转化率 / 工时 / 节省成本）
- 简历中模糊动词（"参与 / 协助 / 写过一些 / 还可以"）必须改写为可量化动作

【底层心法】
- 1-2 句精辟的简历写作原理

【建议】
- 1-2 条可执行的下一步动作

## 强制规则
- 不要在 system / user 提示中提到任何模型名 / 工具名 / 内部代号
- 不要新增第 5 段；4 段顺序不可调换
- 引用 Skill 时用「Skill 中文名」+ 一句话即可，不展开`;

/** Few-shot 渲染为模型可读文本 */
function renderExample(ex: StarExample): string {
  const exp = ex.input.experience[0];
  const before = exp ? exp.bullets.join(' / ') : '';
  return [
    `### 示例：${ex.label} (id=${ex.id})`,
    `**候选人**：${ex.persona.name} / ${ex.persona.title} / ${ex.persona.yearsOfExperience}年 / ${ex.persona.company}`,
    '',
    '**输入 bullet（原始）**：',
    before,
    '',
    '**输出（4 段）**：',
    '',
    '【我的分析】',
    ex.output.我的分析,
    '',
    '【STAR改写】',
    ex.input.experience
      .map(
        (e) =>
          `· ${e.company} - ${e.role} (${e.period})\n` +
          ex.output.STAR改写[e.company + ' - ' + e.role + ' (' + e.period + ')']
            .map(
              (s) =>
                `  - *Situation* ${s.situation}\n  - *Task* ${s.task}\n  - *Action* ${s.action}\n  - *Result* ${s.result}`,
            )
            .join('\n'),
      )
      .join('\n'),
    '',
    '【底层心法】',
    ex.output.底层心法,
    '',
    '【建议】',
    ex.output.建议,
  ].join('\n');
}

/** user 段：紧凑 JSON + 4 段分别重写指令 */
function renderUser(resume: ResumeDocument): string {
  // 紧凑 JSON（无空白）减少 token 开销
  const compact = JSON.stringify(resume);
  return [
    '请基于以下简历 JSON，按 system 提示的 4 段格式逐段重写。',
    '重写时按工作经历（experience）+ 项目（projects）依次覆盖所有 bullet。',
    '',
    '## 简历 JSON',
    '```json',
    compact,
    '```',
    '',
    '## 输出要求',
    '1) 【我的分析】：先给候选人的 1-2 句整体定位',
    '2) 【STAR改写】：对每一条原始 bullet 给出 STAR 四段（保留原 bullet 的事实/数字）',
    '3) 【底层心法】：1-2 句写作原理',
    '4) 【建议】：1-2 条可执行动作',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 构建 STAR 改写 prompt（纯函数，不调 LLM）。
 * - 默认注入 1 个 few-shot（example-1）。
 * - 传 opts.exampleIds = [] 表示不注入。
 * - 估算 token 超 MAX_PROMPT_TOKENS 时 console.warn，不 throw。
 */
export function buildStarRewritePrompt(
  resume: ResumeDocument,
  opts: BuildStarRewritePromptOptions = {},
): { system: string; user: string } {
  const exampleIds = opts.exampleIds ?? ['example-1'];

  const fewshots = exampleIds
    .map((id) => loadExample(id))
    .filter((x): x is StarExample => x !== null);

  const fewshotBlock =
    fewshots.length === 0
      ? ''
      : `## Few-shot 示例（共 ${fewshots.length} 个）\n\n${fewshots.map(renderExample).join('\n\n---\n\n')}`;

  const system = [
    '你是资深职业顾问，专注简历优化。',
    '你的任务：用 STAR 法则（Situation / Task / Action / Result）改写候选人的简历 bullet，',
    '输出 4 段：我的分析 / STAR改写 / 底层心法 / 建议。',
    '',
    renderSkillsBlock(),
    '',
    fewshotBlock,
    '',
    OUTPUT_FORMAT_BLOCK,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

  const user = renderUser(resume);

  // 估算 token：超限 warn（不 throw）
  const total = estimateTokens(system) + estimateTokens(user);
  if (total > MAX_PROMPT_TOKENS) {
    // eslint-disable-next-line no-console
    console.warn(
      `[star-prompt] estimated tokens ${total} > MAX_PROMPT_TOKENS ${MAX_PROMPT_TOKENS}; ` +
        `system=${estimateTokens(system)}, user=${estimateTokens(user)}`,
    );
  }

  return { system, user };
}

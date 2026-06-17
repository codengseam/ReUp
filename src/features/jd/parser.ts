import { z } from 'zod';
import type { JDDocument } from './types';

const JD_SCHEMA = z.object({
  title: z.string(),
  department: z.string().optional(),
  level: z.string().optional(),
  location: z.string().optional(),
  salary: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional(),
  }).optional(),
  hardRequirements: z.array(z.object({
    category: z.enum(['学历', '经验', '技能', '证书', '其他']),
    description: z.string(),
    priority: z.enum(['must', 'preferred']),
  })).optional().default([]),
  responsibilities: z.array(z.string()).optional().default([]),
  skills: z.array(z.object({
    name: z.string(),
    level: z.enum(['精通', '熟悉', '了解']),
    required: z.boolean(),
  })).optional().default([]),
  team: z.object({
    size: z.string().optional(),
    structure: z.string().optional(),
    culture: z.array(z.string()).optional(),
  }).optional(),
  focusPoints: z.array(z.object({
    dimension: z.string(),
    description: z.string(),
    weight: z.enum(['high', 'medium', 'low']),
  })).optional().default([]),
});

/**
 * Rule-based JD parsing fallback. Extracts title, salary range, experience
 * requirement, and education requirement using regex patterns.
 */
function ruleBasedParse(raw: string): JDDocument {
  const titleMatch = raw.match(/(?:招聘|诚聘|急聘)\s*[:：]?\s*([^，,\n、。]+)/);
  // Fallback: use first non-noise line as title.
  const firstLine = raw.split('\n').map(l => l.trim()).find(l => l.length > 0) || '';
  const isNoise = /^[（(]|[）)]$|^[【\[]|^\d+[.、]/.test(firstLine);
  const title = titleMatch?.[1]?.trim() || (isNoise || !firstLine ? '未知职位' : firstLine);

  // Salary: only match when preceded by salary keyword OR at least one
  // number has 'k' suffix (prevents matching "3-5 年经验" as salary).
  const salaryMatch =
    raw.match(/(?:薪资|薪水|薪酬|工资|salary)[^\n]{0,30}?(\d+)([kK])?\s*[-~]\s*(\d+)([kK])?/i) ??
    raw.match(/(\d+)([kK])\s*[-~]\s*(\d+)([kK])?/);
  const salary = salaryMatch
    ? {
        min: parseInt(salaryMatch[1]!, 10) * (salaryMatch[2]?.toLowerCase() === 'k' ? 1000 : 1),
        max: parseInt(salaryMatch[3]!, 10) * (salaryMatch[4]?.toLowerCase() === 'k' ? 1000 : 1),
        currency: 'CNY',
      }
    : undefined;

  const hardRequirements: JDDocument['hardRequirements'] = [];

  const expMatch = raw.match(/(\d+)\s*年(?:以上)?(?:工作)?经验/);
  if (expMatch) {
    hardRequirements.push({
      category: '经验',
      description: `${expMatch[1]!}年以上工作经验`,
      priority: 'must',
    });
  }

  const eduMatch = raw.match(/(本科|硕士|博士|大专)(?:及以上)?/);
  if (eduMatch) {
    hardRequirements.push({
      category: '学历',
      description: `${eduMatch[1]!}及以上学历`,
      priority: 'must',
    });
  }

  return {
    meta: { source: 'text', parsedAt: new Date().toISOString() },
    title,
    salary,
    hardRequirements,
    responsibilities: [],
    skills: [],
    focusPoints: [],
    raw,
  };
}

/**
 * Parse a JD text into structured JDDocument. Uses LLM when llmInvoke is
 * provided, falls back to rule-based regex extraction.
 */
export async function parseJD(
  raw: string,
  options?: {
    llmInvoke?: (messages: Array<{ role: string; content: string }>) => Promise<{ content: string }>;
  },
): Promise<JDDocument> {
  if (options?.llmInvoke) {
    try {
      const prompt = `你是一个 JD（职位描述）解析专家。请从以下 JD 文本中提取结构化信息，输出 JSON。

要求：
1. 提取职位名称、部门、职级、地点、薪资范围
2. 硬性要求：学历、经验年限、技能、证书等（标记 must 或 preferred）
3. 岗位职责列表
4. 技能要求（每条包含名称、掌握程度 精通/熟悉/了解、是否必须）
5. 考察重点（focusPoints）：从 JD 中推断面试官可能重点考察的 3-5 个维度
   - 每条包含：dimension（考察维度，如"系统设计能力"）、description（说明为什么重要，如"JD中多次提到大规模分布式系统..."）、weight（重要程度 high/medium/low）
6. 如果某字段无法识别，留空

输出格式（严格 JSON）：
{
  "title": "",
  "department": "",
  "level": "",
  "location": "",
  "salary": { "min": 0, "max": 0, "currency": "CNY" },
  "hardRequirements": [{"category":"学历","description":"","priority":"must"}],
  "responsibilities": [],
  "skills": [{"name":"","level":"熟悉","required":true}],
  "focusPoints": [{"dimension":"","description":"","weight":"high"}]
}

JD 文本：
---
${raw}
---`;

      const response = await options.llmInvoke([{ role: 'user', content: prompt }]);
      const text = typeof response.content === 'string' ? response.content : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in LLM response');

      const parsed = JD_SCHEMA.parse(JSON.parse(jsonMatch[0]));
      return {
        ...parsed,
        meta: { source: 'llm', parsedAt: new Date().toISOString() },
        raw,
      };
    } catch {
      // Fall through to rule-based
    }
  }
  return ruleBasedParse(raw);
}
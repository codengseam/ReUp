// src/features/resume/diagnostics/impact.ts
// Detects missing quantified impact in resume bullets.

import type { ResumeDocument } from '../types';
import type { DiagnosticIssue } from './types';

const QUANT_PATTERN = /\d+([,.]\d+)?\s*%?|\d+\s*[万亿]|\d+\s*万+|\d+\s*倍|qps|tps|dau|mau|gmv|arpu|留存|转化率|覆盖率|命中\s*\d+|提升\s*\d+|降低\s*\d+/i;
const IMPACT_VERBS = ['提升', '降低', '减少', '增加', '增长', '下降', '优化', '提高', '缩短', '扩大', '覆盖', '服务', '支撑', '保障'];

function hasQuantifier(text: string): boolean {
  return QUANT_PATTERN.test(text);
}

function hasImpactVerb(text: string): boolean {
  return IMPACT_VERBS.some((v) => text.includes(v));
}

function looksLikeResponsibilityOnly(text: string): boolean {
  return hasImpactVerb(text) && !hasQuantifier(text);
}

/**
 * Detect bullets that describe responsibilities without quantified impact.
 */
export function detectImpactIssues(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  for (let i = 0; i < resume.experience.length; i++) {
    const exp = resume.experience[i];
    for (let j = 0; j < exp.bullets.length; j++) {
      const bullet = exp.bullets[j];
      if (bullet.length < 8) continue;
      if (looksLikeResponsibilityOnly(bullet)) {
        issues.push({
          type: 'impact',
          severity: 'warning',
          message: `工作描述缺少量化成果：「${bullet.slice(0, 40)}${bullet.length > 40 ? '…' : ''}」`,
          location: `experience[${i}].bullets[${j}]`,
          suggestion: '补充数字、百分比、用户数、QPS、GMV 等可衡量指标，例如「将接口耗时从 200ms 降至 50ms」。',
        });
      }
    }
  }

  for (let i = 0; i < resume.projects.length; i++) {
    const proj = resume.projects[i];
    for (let j = 0; j < proj.bullets.length; j++) {
      const bullet = proj.bullets[j];
      if (bullet.length < 8) continue;
      if (looksLikeResponsibilityOnly(bullet)) {
        issues.push({
          type: 'impact',
          severity: 'warning',
          message: `项目描述缺少量化成果：「${bullet.slice(0, 40)}${bullet.length > 40 ? '…' : ''}」`,
          location: `projects[${i}].bullets[${j}]`,
          suggestion: '用 STAR 结构补充具体数据，例如「通过重构使核心接口 QPS 从 1k 提升至 8k」。',
        });
      }
    }
  }

  if (issues.length === 0 && (resume.experience.length > 0 || resume.projects.length > 0)) {
    issues.push({
      type: 'impact',
      severity: 'info',
      message: '已检测到量化指标或工作描述较短，建议继续检查关键经历是否都有数据支撑。',
      location: 'overall',
      suggestion: '确保至少 3 条核心经历包含可衡量的业务或技术指标。',
    });
  }

  return issues;
}

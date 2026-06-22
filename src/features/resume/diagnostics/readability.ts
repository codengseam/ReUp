// src/features/resume/diagnostics/readability.ts
// Detects readability and length issues in resume content.

import type { ResumeDocument } from '../types';
import type { DiagnosticIssue } from './types';

const MAX_BULLET_LENGTH = 120;
const MIN_BULLET_LENGTH = 12;
const MAX_TOTAL_CHARS = 8000;
const MIN_TOTAL_CHARS = 300;

function collectAllBullets(resume: ResumeDocument): string[] {
  const bullets: string[] = [];
  for (const exp of resume.experience) bullets.push(...exp.bullets);
  for (const proj of resume.projects) bullets.push(...proj.bullets);
  return bullets;
}

/**
 * Detect readability issues: bullet length, overall length, density.
 */
export function detectReadabilityIssues(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const bullets = collectAllBullets(resume);
  const totalChars = resume.raw.length;

  for (let i = 0; i < resume.experience.length; i++) {
    const exp = resume.experience[i];
    for (let j = 0; j < exp.bullets.length; j++) {
      const bullet = exp.bullets[j];
      if (bullet.length > MAX_BULLET_LENGTH) {
        issues.push({
          type: 'readability',
          severity: 'warning',
          message: `工作描述单条过长（${bullet.length} 字），阅读体验可能下降`,
          location: `experience[${i}].bullets[${j}]`,
          suggestion: `拆分为 2 条短句，每条控制在 ${MAX_BULLET_LENGTH} 字以内，突出一个核心成果。`,
        });
      } else if (bullet.length > 0 && bullet.length < MIN_BULLET_LENGTH) {
        issues.push({
          type: 'readability',
          severity: 'info',
          message: `工作描述单条过短（${bullet.length} 字），信息量可能不足`,
          location: `experience[${i}].bullets[${j}]`,
          suggestion: '补充背景、动作、结果，使单条经历更完整。',
        });
      }
    }
  }

  for (let i = 0; i < resume.projects.length; i++) {
    const proj = resume.projects[i];
    for (let j = 0; j < proj.bullets.length; j++) {
      const bullet = proj.bullets[j];
      if (bullet.length > MAX_BULLET_LENGTH) {
        issues.push({
          type: 'readability',
          severity: 'warning',
          message: `项目描述单条过长（${bullet.length} 字）`,
          location: `projects[${i}].bullets[${j}]`,
          suggestion: `拆分为 2 条短句，每条控制在 ${MAX_BULLET_LENGTH} 字以内。`,
        });
      }
    }
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    issues.push({
      type: 'readability',
      severity: 'warning',
      message: `简历全文过长（${totalChars} 字），建议控制在 ${MAX_TOTAL_CHARS} 字以内`,
      location: 'overall',
      suggestion: '精简非核心经历，保留与目标岗位最相关的 3-5 段经历。',
    });
  }

  if (totalChars > 0 && totalChars < MIN_TOTAL_CHARS) {
    issues.push({
      type: 'readability',
      severity: 'warning',
      message: `简历全文过短（${totalChars} 字），可能无法通过 ATS 初筛`,
      location: 'overall',
      suggestion: '补充基本信息、工作经历、项目经历与技能列表。',
    });
  }

  const avgBulletLength = bullets.length > 0
    ? bullets.reduce((sum, b) => sum + b.length, 0) / bullets.length
    : 0;
  if (bullets.length > 0 && avgBulletLength > 90) {
    issues.push({
      type: 'readability',
      severity: 'info',
      message: `经历 bullet 平均长度 ${Math.round(avgBulletLength)} 字，整体偏长`,
      location: 'overall',
      suggestion: '检查是否有可删除的修饰词，让关键信息更突出。',
    });
  }

  return issues;
}

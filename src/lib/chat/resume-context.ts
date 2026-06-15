import type { ResumeDocument } from '../resume/types';

/**
 * Build a concise resume context string to inject into chat system prompts.
 * Returns empty string if the resume is null or has no useful content.
 */
export function buildResumeContext(resume: ResumeDocument | null): string {
  if (!resume) return '';

  const parts: string[] = ['[用户简历摘要]'];

  if (resume.basic.name) parts.push(`姓名: ${resume.basic.name}`);
  if (resume.basic.title) parts.push(`职位: ${resume.basic.title}`);
  if (resume.basic.yearsOfExperience) {
    parts.push(`工作年限: ${resume.basic.yearsOfExperience}年`);
  }
  if (resume.skills.length > 0) {
    parts.push(`技能: ${resume.skills.slice(0, 10).join(', ')}`);
  }
  if (resume.experience.length > 0) {
    const latest = resume.experience[0]!;
    parts.push(`最近经历: ${latest.company} - ${latest.role} (${latest.period})`);
  }

  // Return empty when resume has no actual content beyond the header.
  if (parts.length <= 1) return '';

  return parts.join('\n');
}

/**
 * Check whether the user message likely needs resume context injection.
 * Simple keyword-based heuristic.
 */
export function shouldInjectResume(message: string): boolean {
  const keywords = ['简历', '我的', '匹配', '差距', '缺什么'];
  return keywords.some((k) => message.includes(k));
}
// src/features/resume/diagnostics/career.ts
// Detects career narrative and trajectory issues.

import type { ResumeDocument } from '../types';
import type { DiagnosticIssue } from './types';

const SENIOR_KEYWORDS = ['高级', '资深', '专家', '负责人', '经理', '总监', '架构师', 'lead', 'senior', 'staff', 'principal'];
const LEADERSHIP_KEYWORDS = ['带领', '团队', '管理', '负责人', '主导', 'owner', 'leader', '管理'];

function isSeniorTitle(title?: string): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return SENIOR_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()) || title.includes(kw));
}

function hasLeadershipEvidence(resume: ResumeDocument): boolean {
  const text = resume.raw.toLowerCase();
  return LEADERSHIP_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

function collectRoleProgression(resume: ResumeDocument): string[] {
  return resume.experience.map((e) => e.role);
}

/**
 * Detect career narrative issues: title/seniority mismatch, missing progression,
 * and skill-role alignment.
 */
export function detectCareerIssues(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const title = resume.basic.title ?? '';
  const skills = resume.skills.map((s) => s.toLowerCase());

  // Senior title but no leadership evidence
  if (isSeniorTitle(title) && !hasLeadershipEvidence(resume)) {
    issues.push({
      type: 'career',
      severity: 'warning',
      message: `职称为「${title}」但未在描述中体现团队/项目主导经验`,
      location: 'basic.title',
      suggestion: '补充带领团队、跨部门协作、独立负责核心模块等能体现 seniority 的经历。',
    });
  }

  // Title says management but bullets are all IC work
  if (title.includes('经理') || title.toLowerCase().includes('manager')) {
    const hasTeamMention = resume.raw.includes('团队') || resume.raw.toLowerCase().includes('team');
    if (!hasTeamMention) {
      issues.push({
        type: 'career',
        severity: 'warning',
        message: '管理岗标题但经历中未出现团队管理相关描述',
        location: 'basic.title',
        suggestion: '明确写出团队规模、管理范围、招聘/绩效/培养目标。',
      });
    }
  }

  // Role progression: same role repeated without growth
  const progression = collectRoleProgression(resume);
  if (progression.length >= 3) {
    const uniqueRoles = new Set(progression);
    if (uniqueRoles.size === 1) {
      issues.push({
        type: 'career',
        severity: 'info',
        message: '多段工作经历职级/Title 未发生变化，晋升轨迹不清晰',
        location: 'experience',
        suggestion: '若实际有晋升，请用不同 Title 或备注体现；若跳槽频繁，请突出每段成长。',
      });
    }
  }

  // Skill-role misalignment: title says backend but no backend skills
  const backendSkills = ['java', 'go', 'python', 'c++', '后端', 'backend', '微服务', '分布式'];
  const frontendSkills = ['前端', 'react', 'vue', 'angular', 'frontend', 'typescript', 'javascript'];
  const titleLower = title.toLowerCase();
  if ((titleLower.includes('后端') || titleLower.includes('backend')) && !skills.some((s) => backendSkills.some((b) => s.includes(b)))) {
    issues.push({
      type: 'career',
      severity: 'warning',
      message: '后端岗位但技能列表缺少明显后端技术栈',
      location: 'skills',
      suggestion: '补充主要后端语言、框架、中间件与分布式经验。',
    });
  }
  if ((titleLower.includes('前端') || titleLower.includes('frontend')) && !skills.some((s) => frontendSkills.some((f) => s.includes(f)))) {
    issues.push({
      type: 'career',
      severity: 'warning',
      message: '前端岗位但技能列表缺少明显前端技术栈',
      location: 'skills',
      suggestion: '补充主流前端框架、工程化工具与性能优化经验。',
    });
  }

  // Missing title
  if (!title || title.trim().length === 0) {
    issues.push({
      type: 'career',
      severity: 'warning',
      message: '缺少求职意向 / 当前 Title，HR 难以快速定位方向',
      location: 'basic.title',
      suggestion: '在简历顶部添加一行目标岗位或当前职级，例如「高级测试开发工程师」。',
    });
  }

  return issues;
}

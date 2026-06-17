import type { ResumeDocument } from '../types';
import type { DiagnosticIssue } from './types';

// Reuse PERIOD_RE from timeline.ts — single source of truth
const PERIOD_RE =
  /(\d{4}\s*年\s*\d{1,2}\s*月\s*[-—~到]+\s*(?:\d{4}\s*年\s*\d{1,2}\s*月|至今|现在|present|\d{4})|\d{4}[.\-/年]?\s*\d{0,2}\s*月?\s*[-—~到]+\s*(?:\d{4}|至今|现在|present)|\d{4}\s*[-—~到]+\s*\d{4})/i;

/**
 * Check if skills listed in the skills section never appear in experience
 * or project bullet points.
 */
function checkUnusedSkills(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!resume.skills || resume.skills.length === 0) return issues;

  // Collect all text from experience and project bullets
  const allBulletText = [
    ...resume.experience.flatMap((e) => e.bullets),
    ...resume.projects.flatMap((p) => p.bullets),
  ].join(' ').toLowerCase();

  for (let i = 0; i < resume.skills.length; i++) {
    const skill = resume.skills[i];
    const skillLower = skill.toLowerCase().trim();

    // Skip very short / generic skills
    if (skillLower.length < 2) continue;

    if (!allBulletText.includes(skillLower)) {
      issues.push({
        type: 'contradiction',
        severity: 'warning',
        message: `技能"${skill}"在技能列表中列出，但在工作经历和项目经历的 bullet 中从未出现`,
        location: `skills[${i}]`,
        suggestion: `如果确实掌握"${skill}"，建议在相关经历中体现；否则建议从技能列表中移除`,
      });
    }
  }

  return issues;
}

/**
 * Check if yearsOfExperience matches the actual duration of work experience.
 */
function checkExperienceYears(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const declaredYears = resume.basic.yearsOfExperience;
  if (declaredYears === undefined || declaredYears === null) return issues;

  // Calculate total experience years from experience entries
  let totalMonths = 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  for (const exp of resume.experience) {
    if (!exp.period) continue;
    const parsed = parsePeriodSimple(exp.period);
    if (!parsed) continue;

    const startMonths = parsed.startYear * 12 + (parsed.startMonth || 1);
    const endMonths = parsed.isPresent
      ? currentYear * 12 + currentMonth
      : parsed.endYear * 12 + (parsed.endMonth || 12);

    if (endMonths > startMonths) {
      totalMonths += endMonths - startMonths;
    }
  }

  const calculatedYears = Math.round((totalMonths / 12) * 10) / 10;

  // Allow some tolerance: ±2 years or ±30% whichever is larger
  const tolerance = Math.max(2, declaredYears * 0.3);
  if (Math.abs(calculatedYears - declaredYears) > tolerance) {
    issues.push({
      type: 'contradiction',
      severity: 'warning',
      message: `工作年限不一致: 声明的 ${declaredYears} 年 vs 实际经历计算的约 ${calculatedYears} 年`,
      location: 'basic.yearsOfExperience',
      suggestion: '请核实工作年限是否准确，或检查是否有遗漏的经历',
    });
  }

  return issues;
}

/**
 * Check for title mismatch (e.g., "Junior" title but many years of experience).
 */
function checkTitleMismatch(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const title = resume.basic.title;
  const years = resume.basic.yearsOfExperience;
  if (!title || years === undefined) return issues;

  const titleLower = title.toLowerCase();

  // Junior title but 5+ years
  const juniorPatterns = ['初级', '实习', '助理', 'junior', 'intern', 'assistant', 'trainee'];
  const isJunior = juniorPatterns.some((p) => titleLower.includes(p));
  if (isJunior && years >= 5) {
    issues.push({
      type: 'contradiction',
      severity: 'info',
      message: `职级与年限不匹配: 职位"${title}"看起来是初级职位，但工作年限为 ${years} 年`,
      location: 'basic.title',
      suggestion: '如果实际职级更高，建议更新职位名称；如果当前确为初级，可忽略',
    });
  }

  // Senior title but < 2 years
  const seniorPatterns = ['高级', '资深', '专家', '总监', '主管', '经理', 'senior', 'staff', 'lead', 'principal', 'director', 'manager', 'head'];
  const isSenior = seniorPatterns.some((p) => titleLower.includes(p));
  if (isSenior && years < 2) {
    issues.push({
      type: 'contradiction',
      severity: 'info',
      message: `职级与年限不匹配: 职位"${title}"看起来是高级职位，但工作年限仅 ${years} 年`,
      location: 'basic.title',
      suggestion: '如果实际职级确实为高级，建议在工作经历中突出展示对应的成就',
    });
  }

  return issues;
}

// ─── Simple period parser (subset of timeline.ts) ────────────────────────

function parsePeriodSimple(period: string): {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  isPresent: boolean;
} | null {
  const m = period.match(PERIOD_RE);
  if (!m) return null;

  const seg = m[0];
  const isPresent = /至今|现在|present/i.test(seg);

  // Extract the first 4-digit year
  const startYearMatch = seg.match(/(\d{4})/);
  if (!startYearMatch) return null;

  const startYear = parseInt(startYearMatch[1], 10);

  // Extract start month if present
  const startMonthMatch = seg.match(/\d{4}\s*[年.\-/]?\s*(\d{1,2})\s*月/);
  const startMonth = startMonthMatch ? parseInt(startMonthMatch[1], 10) : 1;

  if (isPresent) {
    return { startYear, startMonth, endYear: new Date().getFullYear(), endMonth: new Date().getMonth() + 1, isPresent: true };
  }

  // Extract end year (the last 4-digit year)
  const allYears = seg.match(/\d{4}/g);
  if (!allYears || allYears.length < 2) return null;
  const endYear = parseInt(allYears[allYears.length - 1], 10);

  // Extract end month if present
  const endMonthMatch = seg.match(/\d{4}\s*[年.\-/]?\s*(\d{1,2})\s*月\s*$/);
  const endMonth = endMonthMatch ? parseInt(endMonthMatch[1], 10) : 12;

  return { startYear, startMonth, endYear, endMonth, isPresent: false };
}

/**
 * Detect contradictions in the resume.
 * Checks: unused skills, experience years mismatch, title mismatch.
 */
export function detectContradictions(resume: ResumeDocument): DiagnosticIssue[] {
  return [
    ...checkUnusedSkills(resume),
    ...checkExperienceYears(resume),
    ...checkTitleMismatch(resume),
  ];
}
import type { ResumeDocument } from '../types';
import type { DiagnosticIssue } from './types';

// ─── Date format detection ──────────────────────────────────────────────

const DATE_FORMAT_CHINESE = /\d{4}\s*年/;
const DATE_FORMAT_DASH = /\d{4}\s*[-—~]\s*\d{4}/;
const DATE_FORMAT_DOT = /\d{4}\.\d{1,2}/;

/**
 * Classify a date string's format.
 */
function classifyDateFormat(dateStr: string): 'chinese' | 'dash' | 'dot' | 'unknown' {
  if (DATE_FORMAT_CHINESE.test(dateStr)) return 'chinese';
  if (DATE_FORMAT_DOT.test(dateStr)) return 'dot';
  if (DATE_FORMAT_DASH.test(dateStr)) return 'dash';
  return 'unknown';
}

/**
 * Check for inconsistent date formats across experience and education.
 */
function checkDateFormats(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const formats = new Set<string>();

  const allPeriods: string[] = [
    ...resume.experience.map((e) => e.period),
    ...resume.education.map((e) => e.period),
    ...resume.projects.filter((p) => p.period).map((p) => p.period!),
  ];

  for (const period of allPeriods) {
    if (!period) continue;
    const fmt = classifyDateFormat(period);
    if (fmt !== 'unknown') formats.add(fmt);
  }

  if (formats.size > 1) {
    const fmtNames = Array.from(formats).map((f) => {
      if (f === 'chinese') return '中文格式（如"2020年-2022年"）';
      if (f === 'dash') return '短横线格式（如"2020-2022"）';
      if (f === 'dot') return '点号格式（如"2020.03-2022.05"）';
      return f;
    });
    issues.push({
      type: 'format',
      severity: 'warning',
      message: `日期格式不一致: 检测到 ${fmtNames.join('、')} 混用`,
      location: 'experience[*].period, education[*].period',
      suggestion: '建议统一使用一种日期格式，如"2020-2022"或"2020年-2022年"',
    });
  }

  return issues;
}

// ─── Bullet punctuation consistency ─────────────────────────────────────

/**
 * Check if a bullet ends with Chinese period (。) or other punctuation.
 */
function endsWithPunctuation(bullet: string): boolean {
  return /[。！？；，、.!?;,]/.test(bullet.trim().slice(-1));
}

/**
 * Check for inconsistent bullet punctuation across all bullets.
 */
function checkBulletPunctuation(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const allBullets: { text: string; location: string }[] = [];

  for (let i = 0; i < resume.experience.length; i++) {
    for (let j = 0; j < resume.experience[i].bullets.length; j++) {
      allBullets.push({
        text: resume.experience[i].bullets[j],
        location: `experience[${i}].bullets[${j}]`,
      });
    }
  }

  for (let i = 0; i < resume.projects.length; i++) {
    for (let j = 0; j < resume.projects[i].bullets.length; j++) {
      allBullets.push({
        text: resume.projects[i].bullets[j],
        location: `projects[${i}].bullets[${j}]`,
      });
    }
  }

  if (allBullets.length < 2) return issues;

  const withPunct = allBullets.filter((b) => endsWithPunctuation(b.text));
  const withoutPunct = allBullets.filter((b) => !endsWithPunctuation(b.text));

  // If there's a mix (at least 20% of bullets differ from the majority)
  if (withPunct.length > 0 && withoutPunct.length > 0) {
    const total = allBullets.length;
    const minorityRatio = Math.min(withPunct.length, withoutPunct.length) / total;
    if (minorityRatio >= 0.2) {
      const majority = withPunct.length > withoutPunct.length ? '有' : '无';
      issues.push({
        type: 'format',
        severity: 'info',
        message: `标点符号不一致: ${withPunct.length} 条 bullet 以标点结尾，${withoutPunct.length} 条不以标点结尾`,
        location: 'experience[*].bullets[*], projects[*].bullets[*]',
        suggestion: majority === '有'
          ? '建议所有 bullet 统一以句号结尾'
          : '建议所有 bullet 统一不以标点结尾',
      });
    }
  }

  return issues;
}

// ─── Missing sections ───────────────────────────────────────────────────

/**
 * Check for missing sections in the resume.
 */
function checkMissingSections(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  if (!resume.skills || resume.skills.length === 0) {
    issues.push({
      type: 'format',
      severity: 'warning',
      message: '缺少技能板块',
      location: 'skills',
      suggestion: '建议添加技能列表，包括技术栈、工具、语言等',
    });
  }

  if (!resume.education || resume.education.length === 0) {
    issues.push({
      type: 'format',
      severity: 'warning',
      message: '缺少教育背景板块',
      location: 'education',
      suggestion: '建议添加教育经历',
    });
  }

  if (!resume.projects || resume.projects.length === 0) {
    issues.push({
      type: 'format',
      severity: 'info',
      message: '缺少项目经历板块',
      location: 'projects',
      suggestion: '建议添加 2-3 个核心项目经历',
    });
  }

  if (!resume.experience || resume.experience.length === 0) {
    issues.push({
      type: 'format',
      severity: 'error',
      message: '缺少工作经历板块',
      location: 'experience',
      suggestion: '工作经历是简历核心内容，请务必添加',
    });
  }

  return issues;
}

// ─── Short bullets ──────────────────────────────────────────────────────

/**
 * Check for very short bullets (likely incomplete).
 */
function checkShortBullets(resume: ResumeDocument): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  for (let i = 0; i < resume.experience.length; i++) {
    for (let j = 0; j < resume.experience[i].bullets.length; j++) {
      const bullet = resume.experience[i].bullets[j];
      if (bullet.trim().length < 10) {
        issues.push({
          type: 'format',
          severity: 'info',
          message: `Bullet 过短（${bullet.trim().length} 字）: "${bullet.trim()}"`,
          location: `experience[${i}].bullets[${j}]`,
          suggestion: '建议补充具体内容，使用 STAR 法则（情境-任务-行动-结果）',
        });
      }
    }
  }

  for (let i = 0; i < resume.projects.length; i++) {
    for (let j = 0; j < resume.projects[i].bullets.length; j++) {
      const bullet = resume.projects[i].bullets[j];
      if (bullet.trim().length < 10) {
        issues.push({
          type: 'format',
          severity: 'info',
          message: `Bullet 过短（${bullet.trim().length} 字）: "${bullet.trim()}"`,
          location: `projects[${i}].bullets[${j}]`,
          suggestion: '建议补充具体内容，说明技术栈、成果和量化指标',
        });
      }
    }
  }

  return issues;
}

/**
 * Detect format issues in the resume.
 * Checks: date format consistency, bullet punctuation, missing sections, short bullets.
 */
export function detectFormatIssues(resume: ResumeDocument): DiagnosticIssue[] {
  return [
    ...checkDateFormats(resume),
    ...checkBulletPunctuation(resume),
    ...checkMissingSections(resume),
    ...checkShortBullets(resume),
  ];
}
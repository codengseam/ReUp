import type { ResumeDocument } from '../types';
import type { DiagnosticIssue } from './types';

// PERIOD_RE from parser-text.ts — reused for extracting years from period strings.
const PERIOD_RE =
  /(\d{4}\s*年\s*\d{1,2}\s*月\s*[-—~到]+\s*(?:\d{4}\s*年\s*\d{1,2}\s*月|至今|现在|present|\d{4})|\d{4}[.\-/年]?\s*\d{0,2}\s*月?\s*[-—~到]+\s*(?:\d{4}|至今|现在|present)|\d{4}\s*[-—~到]+\s*\d{4})/i;

interface ParsedPeriod {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  isPresent: boolean;
  raw: string;
  source: { type: 'experience' | 'education'; index: number };
}

/**
 * Extract start and end years from a period string like "2022-10 - 至今" or "2020-2023".
 */
function parsePeriod(period: string): { startYear: number; startMonth: number; endYear: number; endMonth: number; isPresent: boolean } | null {
  const m = period.match(PERIOD_RE);
  if (!m) return null;

  const seg = m[0];

  // Case: "2022年10月 - 至今" or "2022年 - 至今"
  const presentMatch = seg.match(/至今|现在|present/i);
  // Case: "2020-2023" or "2020年 - 2022年"
  const yearOnlyMatch = seg.match(/^(\d{4})\s*[-—~到]+\s*(\d{4})$/);
  // Case: "2022.03 - 2023.05" or "2022年03月 - 2023年05月"
  const fullMatch = seg.match(
    /(\d{4})\s*[年.\-/]?\s*(\d{1,2})?\s*月?\s*[-—~到]+\s*(\d{4})\s*[年.\-/]?\s*(\d{1,2})?\s*月?/
  );
  // Case: "2022年 - 至今" or "2022 - 至今"
  const presentYearMatch = seg.match(/^(\d{4})/);

  if (presentMatch) {
    if (yearOnlyMatch) {
      return {
        startYear: parseInt(yearOnlyMatch[1], 10),
        startMonth: 1,
        endYear: parseInt(yearOnlyMatch[2], 10),
        endMonth: 12,
        isPresent: false,
      };
    }
    if (presentYearMatch) {
      return {
        startYear: parseInt(presentYearMatch[1], 10),
        startMonth: 1,
        endYear: new Date().getFullYear(),
        endMonth: new Date().getMonth() + 1,
        isPresent: true,
      };
    }
    return null;
  }

  if (fullMatch) {
    const startYear = parseInt(fullMatch[1], 10);
    const startMonth = fullMatch[2] ? parseInt(fullMatch[2], 10) : 1;
    const endYear = parseInt(fullMatch[3], 10);
    const endMonth = fullMatch[4] ? parseInt(fullMatch[4], 10) : 12;
    return { startYear, startMonth, endYear, endMonth, isPresent: false };
  }

  if (yearOnlyMatch) {
    return {
      startYear: parseInt(yearOnlyMatch[1], 10),
      startMonth: 1,
      endYear: parseInt(yearOnlyMatch[2], 10),
      endMonth: 12,
      isPresent: false,
    };
  }

  return null;
}

/**
 * Collect all periods from experience and education sections.
 */
function collectPeriods(resume: ResumeDocument): ParsedPeriod[] {
  const periods: ParsedPeriod[] = [];

  for (let i = 0; i < resume.experience.length; i++) {
    const exp = resume.experience[i];
    if (exp.period) {
      const parsed = parsePeriod(exp.period);
      if (parsed) {
        periods.push({ ...parsed, raw: exp.period, source: { type: 'experience', index: i } });
      }
    }
  }

  for (let i = 0; i < resume.education.length; i++) {
    const edu = resume.education[i];
    if (edu.period) {
      const parsed = parsePeriod(edu.period);
      if (parsed) {
        periods.push({ ...parsed, raw: edu.period, source: { type: 'education', index: i } });
      }
    }
  }

  return periods;
}

/**
 * Check for overlapping time periods.
 */
function detectOverlaps(periods: ParsedPeriod[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  // Sort by start date
  const sorted = [...periods].sort((a, b) => {
    if (a.startYear !== b.startYear) return a.startYear - b.startYear;
    return a.startMonth - b.startMonth;
  });

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];

      const aEnd = a.endYear * 12 + a.endMonth;
      const bStart = b.startYear * 12 + b.startMonth;

      // If a ends after b starts, there's overlap (allow 1 month gap for transitions)
      if (aEnd > bStart) {
        issues.push({
          type: 'timeline',
          severity: 'warning',
          message: `时间重叠: "${a.raw}" 与 "${b.raw}" 存在时间重叠`,
          location: `${a.source.type}[${a.source.index}].period`,
          suggestion: '请检查两段经历的时间是否准确，或标注为兼职/并行',
        });
      }
    }
  }

  return issues;
}

/**
 * Check for gaps > 6 months between consecutive periods.
 */
function detectGaps(periods: ParsedPeriod[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  // Sort by start date
  const sorted = [...periods].sort((a, b) => {
    if (a.startYear !== b.startYear) return a.startYear - b.startYear;
    return a.startMonth - b.startMonth;
  });

  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i];
    const next = sorted[i + 1];

    const prevEnd = prev.endYear * 12 + prev.endMonth;
    const nextStart = next.startYear * 12 + next.startMonth;

    const gapMonths = nextStart - prevEnd;
    if (gapMonths > 6) {
      issues.push({
        type: 'timeline',
        severity: 'warning',
        message: `时间间隔: "${prev.raw}" 结束到 "${next.raw}" 开始之间有 ${gapMonths} 个月空档`,
        location: `${next.source.type}[${next.source.index}].period`,
        suggestion: '如有空档期活动（学习、自由职业等），建议补充说明',
      });
    }
  }

  return issues;
}

/**
 * Check for future dates.
 */
function detectFutureDates(periods: ParsedPeriod[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  for (const p of periods) {
    if (p.isPresent) continue; // "至今" is fine

    if (p.endYear > currentYear || (p.endYear === currentYear && p.endMonth > currentMonth)) {
      issues.push({
        type: 'timeline',
        severity: 'error',
        message: `未来日期: "${p.raw}" 的结束日期在未来`,
        location: `${p.source.type}[${p.source.index}].period`,
        suggestion: '请修正结束日期，或使用"至今"',
      });
    }

    if (p.startYear > currentYear) {
      issues.push({
        type: 'timeline',
        severity: 'error',
        message: `未来日期: "${p.raw}" 的开始日期在未来`,
        location: `${p.source.type}[${p.source.index}].period`,
        suggestion: '请修正开始日期',
      });
    }
  }

  return issues;
}

/**
 * Check for chronological order violations (experiences should be newest first).
 */
function detectChronologicalViolations(periods: ParsedPeriod[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  // Only check experience entries — they should be in reverse chronological order
  const expPeriods = periods.filter((p) => p.source.type === 'experience');

  for (let i = 0; i < expPeriods.length - 1; i++) {
    const current = expPeriods[i];
    const next = expPeriods[i + 1];

    const currentStart = current.startYear * 12 + current.startMonth;
    const nextStart = next.startYear * 12 + next.startMonth;

    if (nextStart > currentStart) {
      issues.push({
        type: 'timeline',
        severity: 'info',
        message: `时间顺序: "${current.raw}" 应排在 "${next.raw}" 之后（建议按最近在前排列）`,
        location: `experience[${current.source.index}].period`,
        suggestion: '建议将工作经历按时间倒序排列（最近的在最前面）',
      });
    }
  }

  return issues;
}

/**
 * Detect timeline conflicts in the resume.
 * Checks: overlapping periods, gaps > 6 months, future dates, chronological order.
 */
export function detectTimelineConflicts(resume: ResumeDocument): DiagnosticIssue[] {
  const periods = collectPeriods(resume);
  if (periods.length === 0) return [];

  return [
    ...detectOverlaps(periods),
    ...detectGaps(periods),
    ...detectFutureDates(periods),
    ...detectChronologicalViolations(periods),
  ];
}
// src/lib/resume/parser-text.ts
// ReUp v2 Phase 3 P0 (A2): plain-text resume parser.
// Pure string parsing — no markdown-it, no DOM, runs in Node and Edge.
// The markdown parser (A5) strips markdown formatting first, then calls this.

import {
  parseResumeMeta,
  type ResumeDocument,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeProject,
  type ResumeSource,
} from './types';

type SectionKind = 'basic' | 'experience' | 'projects' | 'skills' | 'education' | 'other';

const SECTION_PATTERNS: Array<{ kind: SectionKind; re: RegExp }> = [
  // Note: \b does not work with non-ASCII (CJK) chars in JS regex, so we
  // anchor on the end of the matched title with an optional space and end-of-line.
  { kind: 'basic', re: /^\s*##\s*(个人信息|基本(?:信息|资料)?|个人简介|basic|contact|profile)(?:\s|$)/i },
  { kind: 'experience', re: /^\s*##\s*(工作经历|工作经验|experience|work\s*history|employment)(?:\s|$)/i },
  { kind: 'projects', re: /^\s*##\s*(项目经历|项目经验|projects?|personal\s*projects?)(?:\s|$)/i },
  { kind: 'skills', re: /^\s*##\s*(专业技能|技能清单|技术栈|技术能力|掌握的技能|技能|skills?|tech(?:nical)?\s*stack|core\s*(?:competenc(?:ies|y)))(?:\s|$)/i },
  { kind: 'education', re: /^\s*##\s*(教育经历|教育|学历|education|academic(?:\s*background)?)(?:\s|$)/i },
];

const SUBSECTION_RE = /^\s*###\s+(.+)$/;
const BULLET_RE = /^\s*(?:\\[-*•]|[-*•]|\d+\.)\s*(.*)$/;
// Matches "2022年10月 - 至今", "2021年04月 - 2022年10月", "2020-2023", "2019.6 - 2022.3"
// and the in-line variant "业务负责人，2022年10月 - 至今，重庆" where a Chinese
// comma separates the role token from the period.
const PERIOD_RE =
  /(\d{4}\s*年\s*\d{1,2}\s*月\s*[-—~到]+\s*(?:\d{4}\s*年\s*\d{1,2}\s*月|至今|现在|present|\d{4})|\d{4}[\.\-/年]?\s*\d{0,2}\s*月?\s*[-—~到]+\s*(?:\d{4}|至今|现在|present)|\d{4}\s*[-—~到]+\s*\d{4})/i;
// Bug E: standalone period line used to split paragraph-style experience entries.
// Matches: "2020年-2022年", "2020年 - 2022年", "2020.03-2022.05", "2022年-至今", "2020-2023"
// These patterns match the FULL line being only a date range.
const PERIOD_LINE_RE =
  /^\d{4}\s*[\.\-/年]?\s*(?:至今|今|present|now|\d{4}\s*[\.\-/年]?)\s*$/i;
const PERIOD_LINE_RE_2 =
  /^\d{4}\s*[\.\-/年]?\s*[-—~到]+\s*(?:至今|今|present|now|\d{4}\s*[\.\-/年]?)\s*$/i;
const PERIOD_LINE_RE_3 =
  /^\d{4}\s*[\.\-/年]?\s*\d{1,2}\s*月?\s*[-—~到]+\s*(?:至今|今|present|now|\d{4}\s*[\.\-/年]?)\s*$/i;
const BASIC_FIELD_RE = /^\s*\*{0,2}([^：:]+?)\*{0,2}\s*[：:]\s*(.+?)\s*\\?\s*$/;

const PIPE_SPLIT_RE = /\s*\|\s*/;

/**
 * Clean a single line of stray markdown / HTML noise so the structural
 * regexes see a normalised input. We do NOT do full markdown parsing
 * here — that's the markdown parser's job. We just tolerate light
 * markdown so this can be called on .md content in a pinch.
 */
function cleanLine(raw: string): string {
  let line = raw;
  // Trailing backslash line-continuation
  if (line.endsWith('\\')) line = line.slice(0, -1);
  // Horizontal rule → drop
  if (/^[\s]*(?:\*{3,}|-{3,}|_{3,}|[\*\-_]\s*[\*\-_]\s*[\*\-_][\s\*\-_]*)[\s]*$/.test(line)) return '';
  // HTML entities
  line = line.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  line = line.replace(/&#(\d+);/g, (_m, dec: string) => String.fromCharCode(parseInt(dec, 10)));
  // <br /> → newline
  line = line.replace(/<br\s*\/?\s*>/gi, '\n');
  // <url> / <email>
  line = line.replace(/<\s*(https?:\/\/[^>\s]+)\s*>/g, '$1');
  line = line.replace(/<\s*([\w.+-]+@[\w.-]+\.[\w.-]+)\s*>/g, '$1');
  // Bold / italic
  line = line.replace(/\*\*([^*]+)\*\*/g, '$1');
  line = line.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  // Strip leading bullet markers so "- **数据库**：MySQL" → "数据库：MySQL"
  line = line.replace(/^[-*•]\s*/, '');
  // Strip leading blockquote / list decorations leftover
  line = line.replace(/^>\s*/, '');
  return line.trim();
}

function classifySection(headerLine: string): SectionKind {
  for (const { kind, re } of SECTION_PATTERNS) {
    if (re.test(headerLine)) return kind;
  }
  return 'other';
}

/**
 * Plain-text section header patterns (no `##` prefix required).
 * Matches lines that are ONLY a section title, optionally with decoration
 * like underlines, colons, or brackets. Used as fallback when the input
 * has no markdown headers (e.g. PDF-extracted plain text).
 */
const PLAINTEXT_HEADER_PATTERNS: Array<{ kind: SectionKind; re: RegExp }> = [
  { kind: 'basic', re: /^\s*(?:个人信息|基本信息|基本资料|个人简介|联系方式|basic\s*info|contact\s*(?:info)?|profile)\s*[：:]*\s*$/i },
  { kind: 'experience', re: /^\s*(?:工作与实习经历|实习与工作经历|工作经历|工作经验|职业经历|实习经历|work\s*(?:experience|history)|employment\s*history|professional\s*experience)\s*[：:]*\s*$/i },
  { kind: 'projects', re: /^\s*(?:项目经历|项目经验|项目介绍|项目概述|参与项目|projects?|personal\s*projects?)\s*[：:]*\s*$/i },
  { kind: 'skills', re: /^\s*(?:专业技能|技能清单|技术栈|技术能力|掌握的技能|技能|skills?|tech(?:nical)?\s*stack|core\s*(?:competenc(?:ies|y)))\s*[：:]*\s*$/i },
  { kind: 'education', re: /^\s*(?:教育经历|教育背景|学历|education|academic\s*(?:background)?)\s*[：:]*\s*$/i },
];

/**
 * Check if a plain line (without `##`) looks like a section header.
 * Returns the matched SectionKind, or null if not a header.
 */
function classifyPlainTextHeader(line: string): SectionKind | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Strip Chinese-number / arabic-number prefixes and 【】 brackets
  const stripped = trimmed
    .replace(/^[一二三四五六七八九十]+[、.]\s*/, '')
    .replace(/^\d+(?:\.\d+)*[.、]?\s*/, '')
    .replace(/^【(.+?)】\s*$/, '$1');
  for (const { kind, re } of PLAINTEXT_HEADER_PATTERNS) {
    if (re.test(stripped)) return kind;
  }
  return null;
}

function splitSections(input: string): Array<{ kind: SectionKind; title: string; body: string }> {
  const out: Array<{ kind: SectionKind; title: string; body: string }> = [];
  // Normalise line endings and split on `##` headers
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  let current: { kind: SectionKind; title: string; lines: string[] } | null = null;

  const flush = (): void => {
    if (current) {
      out.push({ kind: current.kind, title: current.title, body: current.lines.join('\n') });
      current = null;
    }
  };

  // First pass: check if there are any `##` headers at all
  const hasMarkdownHeaders = lines.some((l) => /^\s*##\s+/.test(l));

  // In plain-text mode, lines before the first detected section header are
  // typically personal info (name, phone, email). Collect them as `basic`.
  const preludeLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    // Markdown header (## ...)
    if (/^\s*##\s+/.test(line)) {
      flush();
      const kind = classifySection(line);
      current = { kind, title: line.replace(/^\s*##\s+/, '').trim(), lines: [] };
      continue;
    }

    // In markdown mode, also treat lines that look like plain-text headers
    // as section boundaries (e.g. "专业技能" without ## in mixed-mode docs).
    // Only trigger when the line is NOT a bullet and NOT a subsection.
    // Disabled: this causes bullet lines like "- **数据库**：MySQL" to be
    // mis-classified as section headers because "数据库" matches skills pattern.
    // if (hasMarkdownHeaders && current && line.trim()) {
    //   const cleaned = cleanLine(line);
    //   if (!SUBSECTION_RE.test(cleaned) && !BULLET_RE.test(cleaned)) {
    //     const plainKind = classifyPlainTextHeader(cleaned);
    //     if (plainKind && plainKind !== current.kind) {
    //       flush();
    //       current = { kind: plainKind, title: cleaned, lines: [] };
    //       continue;
    //     }
    //   }
    // }

    // Plain-text header fallback (only when no markdown headers exist)
    if (!hasMarkdownHeaders) {
      const cleaned = cleanLine(line);
      // Skip underline decoration lines (===, ---, ___)
      if (/^[=\-_~]{3,}\s*$/.test(cleaned)) continue;
      const plainKind = classifyPlainTextHeader(cleaned);
      if (plainKind) {
        // Flush prelude as `basic` if no explicit basic section yet
        if (preludeLines.length > 0 && !out.some((s) => s.kind === 'basic')) {
          out.push({ kind: 'basic', title: '', body: preludeLines.join('\n') });
          preludeLines.length = 0;
        }
        flush();
        current = { kind: plainKind, title: cleaned, lines: [] };
        continue;
      }
    }

    if (current) {
      current.lines.push(rawLine);
    } else if (!hasMarkdownHeaders) {
      preludeLines.push(rawLine);
    }
  }
  flush();

  // If no sections were found at all, treat the entire input as a single
  // "experience" block so bullets at least get parsed.
  if (out.length === 0 && input.trim()) {
    out.push({ kind: 'experience', title: '', body: input });
  }

  // Bug B: detect trailing info block (tail info block) — if the last lines
  // of the input are plain key:value pairs (NOT bullet lines), treat them as
  // a `basic` section. We only consider lines that:
  //   1. contain `:` or `：`
  //   2. do NOT start with a bullet marker (`- `, `* `, etc.)
  // This prevents "- **数据库**：MySQL" from being mis-classified as tail KV.
  const allLines = input.replace(/\r\n?/g, '\n').split('\n');
  const nonEmptyLines = allLines.map((l, i) => ({ line: l, idx: i })).filter(({ line }) => line.trim() !== '');
  // Find contiguous kv lines at the end
  let tailKvStart = -1;
  for (let i = nonEmptyLines.length - 1; i >= 0; i--) {
    const raw = nonEmptyLines[i]!.line;
    // Skip bullet lines — they belong to sections like skills, not tail info
    if (/^\s*(?:[-*•]|\d+\.)\s+/.test(raw)) break;
    if (/[：:]/.test(raw)) {
      tailKvStart = i;
    } else {
      break;
    }
  }
  if (tailKvStart >= 0) {
    const tailKvLines = nonEmptyLines.slice(tailKvStart).map(({ line }) => line.trim());
    // Also include any empty lines between the last non-kv line and the kv block
    const firstKvIdx = nonEmptyLines[tailKvStart]!.idx;
    const lastNonKvIdx = tailKvStart > 0 ? nonEmptyLines[tailKvStart - 1]!.idx : -1;
    const gapLines = lastNonKvIdx >= 0 && firstKvIdx > lastNonKvIdx + 1
      ? allLines.slice(lastNonKvIdx + 1, firstKvIdx).filter((l) => l.trim() === '')
      : [];
    const kvLines = [...gapLines, ...tailKvLines];
    // Remove tail kv lines from the last section's body
    const lastSec = out[out.length - 1];
    if (lastSec) {
      const lastBodyLines = lastSec.body.split('\n');
      const trimmed = lastBodyLines.filter((l) => {
        const trimmed = l.trim();
        return trimmed !== '' && !kvLines.includes(trimmed);
      });
      lastSec.body = trimmed.join('\n');
    }
    const existingBasic = out.find((s) => s.kind === 'basic');
    if (existingBasic) {
      existingBasic.body += '\n' + kvLines.join('\n');
    } else {
      out.push({ kind: 'basic', title: '', body: kvLines.join('\n') });
    }
  }

  return out;
}

function extractPeriod(text: string): { period: string | undefined; rest: string } {
  const m = text.match(PERIOD_RE);
  if (!m || m.index === undefined) return { period: undefined, rest: text.trim() };
  return { period: m[0].replace(/\s+/g, ' ').trim(), rest: text.replace(m[0], '').trim() };
}

function parseRoleLine(line: string): { role: string; period: string | undefined } {
  const { period, rest } = extractPeriod(line);
  // Strip parens that only contained the period info. We strip:
  //   - trailing "）" or ")"
  //   - a trailing "| location" pipe segment
  //   - any tokens after the period's first split (Chinese or English comma),
  //     since the trailing tail is almost always a location (e.g. "重庆")
  //     and not part of the role.
  let role = rest.replace(/[()()（）]+\s*$/g, '').replace(/^[（(]\s*[)）]/g, '').trim();
  // Collapse double separators (e.g. "（业务负责人，," from a partial paren strip)
  role = role.replace(/[，,]{2,}/g, '，').replace(/[，,]\s*$/g, '').trim();
  if (period) {
    // The role, if any, sits BEFORE the period token. Walk the original
    // (pre-extract) input up to the period's first character.
    const idx = line.indexOf(period);
    if (idx > 0) {
      const before = line.slice(0, idx).trim();
      // Strip a leading "）" or ")" that wraps a meta prefix.
      const m = before.match(/^[（(](.+?)[)）]\s*$/);
      if (m) {
        role = m[1]!.trim();
      } else {
        // The role prefix may be inside an unclosed paren like
        // "懂车帝 - 抖音电商（业务负责人，". Strip back to the LAST opening
        // paren (or comma boundary) so we keep the project/department prefix
        // but drop the "（role，" tail.
        const cutAt = Math.max(before.lastIndexOf('（'), before.lastIndexOf('('));
        if (cutAt > 0) role = before.slice(0, cutAt).trim();
        else role = before.replace(/[，,]\s*[^，,]*$/, '').trim();
      }
    }
  }
  // Strip a trailing "| location" pipe segment
  role = role.split(PIPE_SPLIT_RE)[0]?.trim() ?? role;
  return { role, period };
}

function extractBullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;
    const m = BULLET_RE.exec(line);
    if (!m) continue;
    const text = (m[1] ?? '').trim();
    if (text) out.push(text);
  }
  return out;
}

function isBulletLine(line: string): boolean {
  return BULLET_RE.test(cleanLine(line));
}

function firstNonBulletLine(lines: string[]): string | undefined {
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;
    if (isBulletLine(line)) continue;
    return line;
  }
  return undefined;
}

function parseExperienceEntry(headerLine: string, bodyLines: string[]): ResumeExperience | null {
  const cleanedHeader = cleanLine(headerLine);
  const headerPeriod = extractPeriod(cleanedHeader);
  let company = cleanedHeader;
  let role = '';
  let period: string | undefined = headerPeriod.period;
  const rest = headerPeriod.rest;

  if (period) {
    // Header already had a period; header (minus period) is the company.
    company = rest;
  }

  // If the header is a "Company (meta1, meta2, period, location)" single-line
  // form (very common in Chinese resumes), split the meta tail so that
  // `company` becomes the bare company name and `role` is the first meta
  // token that looks like a job title.
  if (cleanedHeader.includes('（') || cleanedHeader.includes('(')) {
    const split = splitHeaderParen(cleanedHeader);
    if (split) {
      company = split.company;
      if (!role && split.role) role = split.role;
    }
  }

  const firstNonBullet = firstNonBulletLine(bodyLines);
  if (firstNonBullet) {
    const { role: r, period: p } = parseRoleLine(firstNonBullet);
    if (r && !role) role = r;
    if (p && !period) period = p;
  }

  // If we still don't have a title, try parsing the first body line
  // as an inline "Company | Role | Period" bullet.
  if (!period && !role && bodyLines.length > 0) {
    const firstRaw = cleanLine(bodyLines[0] ?? '');
    const pipeMatch = firstRaw.match(/^[-*•]?\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/);
    if (pipeMatch) {
      const candCompany = (pipeMatch[1] ?? '').trim();
      const candRole = (pipeMatch[2] ?? '').trim();
      const candPeriodRaw = (pipeMatch[3] ?? '').trim();
      const { period: candPeriod } = extractPeriod(candPeriodRaw);
      if (candCompany && (candRole || candPeriod)) {
        company = candCompany;
        role = candRole;
        period = candPeriod;
        // Use the remaining lines (after the title bullet) as bullets
        bodyLines = bodyLines.slice(1);
      }
    }
  }

  if (!company && !role) return null;
  if (!role) role = company;
  if (!company) company = 'Unknown';
  const bullets = extractBullets(bodyLines);
  return { company, role, period: period ?? '', bullets };
}

function parseExperienceEntryFromBlock(headerLine: string, bodyLines: string[]): ResumeExperience | null {
  const cleanedHeader = cleanLine(headerLine);
  // If the header itself is a standalone period line, use the period as the
  // period field and the first body line as the header (company+role).
  const isStandalonePeriod = PERIOD_LINE_RE.test(cleanedHeader) || PERIOD_LINE_RE_2.test(cleanedHeader) || PERIOD_LINE_RE_3.test(cleanedHeader);
  if (isStandalonePeriod && bodyLines.length > 0) {
    const firstBody = cleanLine(bodyLines[0] ?? '');
    if (firstBody) {
      // Parse first body line as company+role, use header as period
      const entry = parseExperienceEntry(firstBody, bodyLines.slice(1));
      if (entry) {
        entry.period = cleanedHeader;
      }
      return entry;
    }
  }
  return parseExperienceEntry(headerLine, bodyLines);
}

/**
 * Tokens that signal "this is a job title" in the meta tail of a header line.
 * Chinese resumes commonly use: 负责人, 业务负责人, 团队负责人, 工程师, 测试工程师,
 * 开发工程师, 经理, 主管, 总监, 实习生.
 */
const ROLE_KEYWORDS = /(负责人|工程师|实习生|经理|主管|总监|owner|Owner|lead|Lead|eng|Eng)/;

/**
 * Split a "Company (meta1, meta2, period, location)" header into
 * `{ company, role }`. The `role` is the first meta token that matches
 * `ROLE_KEYWORDS`; if none match, `role` is undefined.
 *
 * Returns null if the header doesn't have a paren tail — callers fall back
 * to their existing logic.
 */
function splitHeaderParen(header: string): { company: string; role?: string } | null {
  // Find the LAST opening paren so the company name can contain dashes.
  const openIdx = Math.max(header.lastIndexOf('（'), header.lastIndexOf('('));
  if (openIdx <= 0) return null;
  const closeIdx = Math.max(header.lastIndexOf('）'), header.lastIndexOf(')'));
  if (closeIdx <= openIdx) return null;
  const company = header.slice(0, openIdx).trim();
  const inside = header.slice(openIdx + 1, closeIdx).trim();
  if (!company || !inside) return null;
  const parts = inside.split(/[，,]/).map((p) => p.trim()).filter(Boolean);
  const roleHit = parts.find((p) => ROLE_KEYWORDS.test(p));
  if (!roleHit) return null;
  return { company, role: roleHit };
}

function parseProjectEntry(headerLine: string, bodyLines: string[]): ResumeProject | null {
  const name = cleanLine(headerLine);
  if (!name) return null;
  const firstNonBullet = firstNonBulletLine(bodyLines);
  const { period } = firstNonBullet ? extractPeriod(firstNonBullet) : { period: undefined };
  const bullets = extractBullets(bodyLines);
  return { name, period, bullets };
}

/**
 * Split a project/experience section body into sub-entries.
 *
 * Each sub-block has:
 *   - `header`: the title (from `### ` or detected "title line")
 *   - `lines`: subsequent non-empty lines (which the entry parser then
 *     splits into role lines and bullets)
 *   - `headerSource`: where the header came from
 *     - `'subsection'`: explicit `### ` header
 *     - `'title-line'`: a non-bullet line detected as a title (e.g. "个人 AI 实践项目")
 *     - `'none'`: no header at all
 *
 * Splitting rules:
 * - A `### ` line starts a new sub-block (headerSource = 'subsection').
 * - A non-bullet, non-`###` line that appears AFTER we've already
 *   collected at least one bullet in the current sub-block starts a new
 *   sub-block with this line as the header (headerSource = 'title-line').
 *   This handles "个人 AI 实践项目" style headings that have no `### ` marker.
 * - Otherwise lines accumulate in the current sub-block.
 *
 * If `fanOut` is true and a sub-block has no real `### ` source
 * (headerSource != 'subsection') and contains only bullets (no non-bullet
 * "role" line), treat each bullet as a separate sub-entry. fanOut is
 * enabled for `projects` and disabled for `experience`.
 */
function splitSubBlocks(
  body: string,
  options: { fanOut: boolean } = { fanOut: true }
): Array<{ header: string; lines: string[]; headerSource: 'subsection' | 'title-line' | 'none' }> {
  type HeaderSource = 'subsection' | 'title-line' | 'none';
  type SubBlock = { header: string; lines: string[]; hasBullet: boolean; headerSource: HeaderSource };
  type PublicSubBlock = { header: string; lines: string[]; headerSource: HeaderSource };

  const lines = body.split('\n');
  const blocks: SubBlock[] = [];
  let current: SubBlock | null = null;

  const flush = (): void => {
    if (current) {
      const { header, lines: subLines, headerSource } = current;
      blocks.push({ header, lines: subLines, hasBullet: current.hasBullet, headerSource });
      current = null;
    }
  };

  for (const rawLine of lines) {
    const cleaned = cleanLine(rawLine);
    const m = rawLine.match(SUBSECTION_RE);
    if (m) {
      flush();
      current = { header: (m[1] ?? '').trim(), lines: [], hasBullet: false, headerSource: 'subsection' };
      continue;
    }
    if (!cleaned) continue; // skip empty
    // Bug E: paragraph-style experience — a standalone period line starts a new entry.
    // A "standalone" period line means the line is ONLY a date range.
    const isStandalonePeriodLine = PERIOD_LINE_RE.test(cleaned) || PERIOD_LINE_RE_2.test(cleaned) || PERIOD_LINE_RE_3.test(cleaned);
    if (isStandalonePeriodLine) {
      if (current && (current.lines.length > 0 || current.header)) {
        flush();
      }
      if (!current) {
        current = { header: cleaned, lines: [], hasBullet: false, headerSource: 'title-line' };
      } else {
        // current exists but has no content yet (header-only), just update header
        current.header = cleaned;
        current.headerSource = 'title-line';
      }
      continue;
    }
    if (current) {
      const isBullet = isBulletLine(cleaned);
      if (!isBullet && current.hasBullet) {
        // Non-bullet line after bullets → start new sub-block with this line as header
        flush();
        current = { header: cleaned, lines: [], hasBullet: false, headerSource: 'title-line' };
      } else {
        current.lines.push(rawLine);
        if (isBullet) current.hasBullet = true;
      }
    } else {
      // No current block — start implicit
      current = { header: '', lines: [rawLine], hasBullet: isBulletLine(cleaned), headerSource: 'none' };
    }
  }
  flush();

  if (!options.fanOut) return blocks.map<PublicSubBlock>(({ header, lines: l, headerSource }) => ({ header, lines: l, headerSource }));

  // Fan out sub-blocks that have NO header at all (headerSource === 'none')
  // AND only contain bullets. This protects titled sub-blocks (e.g. "个人 AI
  // 实践项目") from being shredded into separate entries.
  const expanded: PublicSubBlock[] = [];
  for (const b of blocks) {
    if (b.headerSource !== 'none') {
      expanded.push({ header: b.header, lines: b.lines, headerSource: b.headerSource });
      continue;
    }
    const cleaned = b.lines.map(cleanLine).filter(Boolean);
    const hasNonBulletLine = cleaned.some((l) => !isBulletLine(l));
    if (!hasNonBulletLine && cleaned.length >= 2) {
      for (const l of cleaned) {
        const m = BULLET_RE.exec(l);
        const text = m?.[1]?.trim() ?? l;
        expanded.push({ header: text, lines: [], headerSource: 'title-line' });
      }
    } else {
      expanded.push({ header: b.header, lines: b.lines, headerSource: b.headerSource });
    }
  }
  return expanded;
}

function parseBasicSection(body: string, headerTitle: string): {
  basic: ResumeDocument['basic'];
} {
  const lines = body.split('\n').map(cleanLine).filter(Boolean);
  const basic: ResumeDocument['basic'] = {};
  const contact: Record<string, string> = {};
  for (const line of lines) {
    // Bug C: split on pipes first so "电话：x | 邮箱：y" yields two k:v pairs.
    const fragments = line.split(PIPE_SPLIT_RE).map((f) => f.trim()).filter(Boolean);
    for (const frag of fragments) {
      const m = frag.match(BASIC_FIELD_RE);
      if (!m) continue;
      const key = (m[1] ?? '').trim();
      const value = (m[2] ?? '').trim();
      if (!key || !value) continue;
      const keyLower = key.toLowerCase();
      if (keyLower.includes('姓名') || keyLower === 'name') {
        basic.name = value;
      } else if (keyLower.includes('电话') || keyLower === 'phone' || keyLower === 'mobile') {
        contact.phone = value;
      } else if (keyLower.includes('邮箱') || keyLower === 'email') {
        contact.email = value;
      } else if (keyLower.includes('微信') || keyLower === 'wechat') {
        contact.wechat = value;
      } else if (keyLower.includes('网站') || keyLower === 'website' || keyLower === 'blog') {
        contact.website = value;
      } else if (keyLower.includes('求职意向') || keyLower === '意向岗位' || keyLower === 'title') {
        basic.title = value;
      } else if (keyLower.includes('工作经验') || keyLower.includes('工作年限') || keyLower === 'experience') {
        const years = parseInt(value.match(/\d+/)?.[0] ?? '', 10);
        if (!Number.isNaN(years)) basic.yearsOfExperience = years;
      } else {
        contact[key] = value;
      }
    }
  }
  if (Object.keys(contact).length > 0) basic.contact = contact;
  // First `##` block whose title contains 个人/基本/contact → also the section name suggests `basic`
  void headerTitle;
  return { basic };
}

function parseSkillsSection(body: string): string[] {
  const lines = body
    .split('\n')
    .map(cleanLine)
    .filter(Boolean);
  const skills: string[] = [];
  // We treat each bullet line as a "skill group". Within a group we split on
  // common Chinese / English separators — but NOT on `:` / `：` because
  // categories like "数据库：MySQL" are intentionally one logical skill entry.
  const SEP_RE = /[、,;；\/]| and | & /i;
  const SENTENCE_RE = /[;；。]/;
  const push = (raw: string) => {
    const cleaned = raw.replace(/^\*+\s*/, '').replace(/\*+\s*$/, '').trim();
    if (!cleaned) return;
    if (skills.includes(cleaned)) return;
    skills.push(cleaned);
  };
  for (const line of lines) {
    const m = BULLET_RE.exec(line);
    let text = m?.[1]?.trim() ?? line;
    if (!text) continue;
    // Bug D: if the text is a long sentence without common list separators,
    // AND does not contain a colon (which indicates a category prefix like
    // "数据库：MySQL"), try splitting by sentence terminators.
    if (text.length > 20 && ![...text].some((c) => /[、,;；\/]/.test(c)) && !/[：:]/.test(text)) {
      const sentences = text.split(SENTENCE_RE).map((s) => s.trim()).filter(Boolean);
      if (sentences.length > 1) {
        for (const s of sentences) push(s);
        continue;
      }
    }
    const parts = text.split(SEP_RE).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) push(p);
  }
  return skills;
}

function parseEducationSection(body: string): ResumeEducation[] {
  const lines = body.split('\n').map(cleanLine).filter(Boolean);
  const out: ResumeEducation[] = [];
  // Strategy: non-bullet lines form a "title block" (school/degree/period).
  // Bullet lines attached to a title block are collected as `notes`. When
  // we hit a new title block (a non-bullet line after we've already seen
  // bullets), we flush the previous entry — including its notes.
  let blockLines: string[] = [];
  let blockNotes: string[] = [];
  let sawBullets = false;
  const consumeBlock = (): void => {
    if (blockLines.length === 0 && blockNotes.length === 0) return;
    if (blockLines.length === 0) {
      // Pure notes without a title — skip (orphaned).
      blockLines = [];
      blockNotes = [];
      sawBullets = false;
      return;
    }
    const joined = blockLines.join(' ');
    const { period } = extractPeriod(joined);
    const tokens = joined.split(PIPE_SPLIT_RE).map((t) => t.trim()).filter(Boolean);
    let school = '';
    let degree = '';
    if (tokens.length >= 2) {
      school = tokens[0] ?? '';
      degree = tokens[1] ?? '';
    } else {
      school = tokens[0] ?? joined;
    }
    const entry: ResumeEducation = { school, degree, period: period ?? '' };
    if (blockNotes.length > 0) entry.notes = blockNotes;
    out.push(entry);
    blockLines = [];
    blockNotes = [];
    sawBullets = false;
  };
  for (const line of lines) {
    if (isBulletLine(line)) {
      const m = BULLET_RE.exec(line);
      const text = m?.[1]?.trim();
      if (text) blockNotes.push(text);
      sawBullets = true;
      continue;
    }
    if (sawBullets) {
      // New title line after bullets — flush previous block first.
      consumeBlock();
    }
    blockLines.push(line);
  }
  consumeBlock();
  return out;
}

/**
 * Parse a plain-text resume into a `ResumeDocument`.
 * Tolerant of light markdown noise (bold, link brackets, HTML entities)
 * — the dedicated markdown parser strips formatting more aggressively.
 */
export function parseTextResume(input: string, source: ResumeSource = 'text'): ResumeDocument {
  const doc: ResumeDocument = {
    meta: parseResumeMeta(source),
    basic: {},
    experience: [],
    projects: [],
    skills: [],
    education: [],
    raw: input,
  };
  if (!input || !input.trim()) return doc;

  const sections = splitSections(input);
  for (const sec of sections) {
    if (sec.kind === 'basic') {
      const { basic } = parseBasicSection(sec.body, sec.title);
      doc.basic = basic;
    } else if (sec.kind === 'experience') {
      const blocks = splitSubBlocks(sec.body, { fanOut: false });
      for (const b of blocks) {
        const entry = parseExperienceEntryFromBlock(b.header, b.lines);
        if (entry) doc.experience.push(entry);
      }
    } else if (sec.kind === 'projects') {
      const blocks = splitSubBlocks(sec.body, { fanOut: true });
      for (const b of blocks) {
        const entry = parseProjectEntry(b.header, b.lines);
        if (entry) doc.projects.push(entry);
      }
    } else if (sec.kind === 'skills') {
      doc.skills = parseSkillsSection(sec.body);
    } else if (sec.kind === 'education') {
      doc.education = parseEducationSection(sec.body);
    }
  }
  return doc;
}

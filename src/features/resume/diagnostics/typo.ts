import type { DiagnosticIssue } from './types';

// ─── High-precision Chinese context patterns ───────────────────────────
// These are checked with surrounding context to reduce false positives.
const CHINESE_CONTEXT_RULES: Array<{
  wrong: string;
  correct: string;
  description: string;
  check: (ctx: { before: string; after: string }) => boolean;
}> = [
  {
    wrong: '在',
    correct: '再',
    description: '"在"应为"再"（表示再次/重复）',
    // "在" should be "再" when followed by repetition-indicating chars
    // e.g. "在一次" → "再一次", "在来" → "再来", "在也不" → "再也不"
    check: (ctx) => /^[一次遍回也来]/.test(ctx.after),
  },
  {
    wrong: '做',
    correct: '作',
    description: '"做"应为"作"（固定搭配）',
    check: (ctx) => /^[为用业工]/.test(ctx.after),
  },
  {
    wrong: '那',
    correct: '哪',
    description: '"那"应为"哪"（疑问代词）',
    check: (ctx) => /[什怎]么/.test(ctx.before) || /[些个里]/.test(ctx.after),
  },
  {
    wrong: '它',
    correct: '他',
    description: '"它"应为"他"（指人）',
    check: (ctx) => /[人职师员导].{0,2}$/.test(ctx.before),
  },
];

// ─── English common misspellings ────────────────────────────────────────
const ENGLISH_TYPO_MAP: Record<string, string> = {
  recieve: 'receive',
  occured: 'occurred',
  seperate: 'separate',
  definately: 'definitely',
  accomodate: 'accommodate',
  untill: 'until',
  thier: 'their',
  recieved: 'received',
  buisness: 'business',
  calender: 'calendar',
  begining: 'beginning',
  comming: 'coming',
  enviroment: 'environment',
  goverment: 'government',
  indispensible: 'indispensable',
  knowlege: 'knowledge',
  neccessary: 'necessary',
  successfull: 'successful',
  wierd: 'weird',
  acheive: 'achieve',
  arguement: 'argument',
  commited: 'committed',
  concensus: 'consensus',
  dependant: 'dependent',
  embarass: 'embarrass',
  existance: 'existence',
  foriegn: 'foreign',
  greatful: 'grateful',
  guarantee: 'guarantee',
  harrass: 'harass',
  immediatly: 'immediately',
  independant: 'independent',
  liason: 'liaison',
  lisence: 'license',
  maintainance: 'maintenance',
  millenium: 'millennium',
  noticable: 'noticeable',
  occassion: 'occasion',
  occurrance: 'occurrence',
  perserverance: 'perseverance',
  prefered: 'preferred',
  priviledge: 'privilege',
  publically: 'publicly',
  reccomend: 'recommend',
  refered: 'referred',
  relevent: 'relevant',
  religeous: 'religious',
  resistence: 'resistance',
  responsability: 'responsibility',
  rythm: 'rhythm',
  scedule: 'schedule',
  sorround: 'surround',
  strenght: 'strength',
  supercede: 'supersede',
  suprise: 'surprise',
  threshhold: 'threshold',
  tommorow: 'tomorrow',
  transfered: 'transferred',
  truely: 'truly',
  unforseen: 'unforeseen',
  unfortunatly: 'unfortunately',
  useable: 'usable',
  vacume: 'vacuum',
  visability: 'visibility',
  wether: 'whether',
  writting: 'writing',
};

/**
 * Detect Chinese typos in text using hardcoded patterns.
 * Scans line by line and reports each occurrence with location.
 */
function detectChineseTypos(text: string): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const lines = text.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line.trim()) continue;

    // Check context-based rules
    for (const rule of CHINESE_CONTEXT_RULES) {
      let pos = 0;
      while (pos < line.length) {
        const idx = line.indexOf(rule.wrong, pos);
        if (idx === -1) break;
        const before = line.slice(Math.max(0, idx - 3), idx);
        const after = line.slice(idx + 1, idx + 4);
        if (rule.check({ before, after })) {
          issues.push({
            type: 'typo',
            severity: 'warning',
            message: `${rule.description}: 第${lineIdx + 1}行 "${line.slice(Math.max(0, idx - 3), idx + 5).trim()}"`,
            location: `line:${lineIdx + 1}`,
            suggestion: `将"${rule.wrong}"改为"${rule.correct}"`,
          });
        }
        pos = idx + 1;
      }
    }
  }

  return issues;
}

/**
 * Detect English misspellings in text.
 */
function detectEnglishTypos(text: string): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const lines = text.split('\n');

  // Word boundary regex for each known misspelling
  for (const [wrong, correct] of Object.entries(ENGLISH_TYPO_MAP)) {
    const re = new RegExp(`\\b${wrong}\\b`, 'gi');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let match: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((match = re.exec(line)) !== null) {
        const word = match[0];
        // Preserve capitalization
        const suggested =
          word[0] === word[0].toUpperCase()
            ? correct.charAt(0).toUpperCase() + correct.slice(1)
            : correct;
        issues.push({
          type: 'typo',
          severity: 'warning',
          message: `英文拼写错误: "${word}" 应为 "${suggested}"`,
          location: `line:${lineIdx + 1}`,
          suggestion: `将"${word}"改为"${suggested}"`,
        });
      }
    }
  }

  return issues;
}

/**
 * Detect typos (Chinese and English) in the given text.
 * Returns an array of DiagnosticIssue for each detected typo.
 */
export function detectTypos(text: string): DiagnosticIssue[] {
  return [...detectChineseTypos(text), ...detectEnglishTypos(text)];
}
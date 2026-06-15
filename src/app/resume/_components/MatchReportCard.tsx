'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Sparkles, Target, TrendingUp, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  computeAtsCoverage,
  suggestSectionForKeyword,
  type JdKeyword,
} from '@/lib/resume/ats';
import { classifyDimensions, DEFAULT_PRIORITIES } from '@/lib/resume/matcher';
import type {
  ATSResult,
  MatchReport,
  ResumeDocument,
  ResumeSection,
} from '@/lib/resume/types';

export interface MatchReportCardProps {
  resume: ResumeDocument;
  jd: string;
  atsResult?: ATSResult;
  matchReport?: MatchReport;
}

const FALLBACK_ATS: ATSResult = {
  jdKeywords: [],
  coverage: { hits: 0, total: 0, percentage: 0 },
  missing: [],
};

export function MatchReportCard({ resume, jd, atsResult, matchReport }: MatchReportCardProps) {
  const [computedAts, setComputedAts] = useState<ATSResult | null>(atsResult ?? null);
  useEffect(() => {
    if (atsResult) {
      setComputedAts(atsResult);
      return;
    }
    let cancelled = false;
    void (async () => {
      let jdKeywords: JdKeyword[] = [];
      try {
        const res = await fetch('/api/resume/jd-keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jd }),
        });
        const json = (await res.json()) as { keywords?: JdKeyword[] };
        if (json.keywords) jdKeywords = json.keywords;
      } catch {
        // API failed — keywords will be empty
      }
      if (cancelled) return;
      const coverage = computeAtsCoverage(resume, jdKeywords);
      if (cancelled) return;
      const resumeHaystack = buildResumeHaystack(resume);
      const missing: ATSResult['missing'] = [];
      for (const kw of jdKeywords) {
        const t = kw.term.toLowerCase();
        if (!t) continue;
        if (!resumeHaystack.includes(t)) {
          missing.push({ term: kw.term, suggestedSection: suggestSectionForKeyword(kw.term) });
        }
      }
      if (!cancelled) {
        setComputedAts({ jdKeywords, coverage, missing });
      }
    })();
    return () => { cancelled = true; };
  }, [resume, jd, atsResult]);

  const ats = computedAts ?? FALLBACK_ATS;

  const report = useMemo<MatchReport>(() => {
    if (matchReport) return matchReport;
    return buildReportSync(resume);
  }, [resume, matchReport]);

  const tone = coverageTone(ats.coverage.percentage);
  const toneTrackClass = TONE_TRACK_CLASS[tone];
  const toneTextClass = TONE_TEXT_CLASS[tone];
  const coverageLabel = `${ats.coverage.percentage.toFixed(1)}%`;

  return (
    <div className="pt-4 border-t border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <Target className="w-3 h-3" />
          匹配报告
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border border-border font-mono ${toneTextClass}`}>
          覆盖率 {coverageLabel}
        </span>
      </div>

      <Progress
        value={ats.coverage.percentage}
        aria-label="Keyword coverage percentage"
        aria-valuenow={ats.coverage.percentage}
        className={`h-1.5 mb-3 ${toneTrackClass} ${TONE_INDICATOR_CLASS[tone]}`}
      />

      <div className="grid grid-cols-2 gap-2">
        <StrengthsCard strengths={report.strengths} />
        <GapsCard gaps={report.gaps} />
        <PrioritiesCard priorities={report.priorities} />
        <MissingKeywordsCard missing={ats.missing} />
      </div>
    </div>
  );
}

function StrengthsCard({ strengths }: { strengths: MatchReport['strengths'] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground mb-1.5">
        <TrendingUp className="w-3 h-3 text-emerald-600" />
        优势 ({strengths.length})
      </div>
      {strengths.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">暂无明显优势</p>
      ) : (
        <ul className="space-y-1.5">
          {strengths.map((s) => (
            <li key={s.dimension} className="flex items-start gap-1.5">
              <span
                data-slot="strength-dot"
                className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-foreground">{s.dimension}</p>
                {s.evidence && (
                  <p className="text-[9px] text-muted-foreground leading-relaxed mt-0.5">{s.evidence}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GapsCard({ gaps }: { gaps: MatchReport['gaps'] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground mb-1.5">
        <AlertCircle className="w-3 h-3 text-amber-600" />
        短板 ({gaps.length})
      </div>
      {gaps.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">暂无明显短板</p>
      ) : (
        <ul className="space-y-1">
          {gaps.map((g) => (
            <li key={g.dimension} className="flex items-center justify-between gap-1.5">
              <p className="text-[10px] font-medium text-foreground truncate">{g.dimension}</p>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${SEVERITY_BADGE_CLASS[g.severity]}`}>
                {g.severity}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrioritiesCard({ priorities }: { priorities: MatchReport['priorities'] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground mb-1.5">
        <Sparkles className="w-3 h-3 text-primary" />
        优先级建议
      </div>
      <ol className="space-y-1.5 list-none">
        {priorities.map((p) => (
          <li key={p.rank} className="flex items-start gap-1.5">
            <span className="text-[10px] font-mono font-semibold text-foreground shrink-0 w-3.5">
              {p.rank}.
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-foreground leading-relaxed">{p.action}</p>
              <span className={`inline-block mt-0.5 text-[9px] px-1.5 py-0.5 rounded border ${IMPACT_BADGE_CLASS[p.expectedImpact] ?? ''}`}>
                {IMPACT_LABEL[p.expectedImpact] ?? p.expectedImpact}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MissingKeywordsCard({ missing }: { missing: ATSResult['missing'] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground mb-1.5">
        <XCircle className="w-3 h-3 text-red-600" />
        缺失关键词 ({missing.length})
      </div>
      {missing.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">所有关键词都已覆盖</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {missing.map((m) => (
            <span
              key={m.term}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5 text-[9px] text-foreground"
            >
              <span className="font-medium">{m.term}</span>
              <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
                {SECTION_LABEL[m.suggestedSection]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function buildReportSync(resume: ResumeDocument): MatchReport {
  const dims = classifyDimensions(resume);
  const strengths: MatchReport['strengths'] = [];
  const gaps: MatchReport['gaps'] = [];
  for (const [dimension, entry] of Object.entries(dims)) {
    if (entry.evidence.length > 0) {
      strengths.push({ dimension, evidence: entry.evidence });
    } else if (entry.score === 0) {
      gaps.push({ dimension, severity: 'high' });
    } else if (entry.score < 0.1) {
      gaps.push({ dimension, severity: 'medium' });
    } else {
      gaps.push({ dimension, severity: 'low' });
    }
  }
  return {
    strengths,
    gaps,
    priorities: DEFAULT_PRIORITIES.map((p) => ({ ...p })),
  };
}

function buildResumeHaystack(resume: ResumeDocument): string {
  const parts: string[] = [resume.raw];
  if (resume.basic.name) parts.push(resume.basic.name);
  if (resume.basic.title) parts.push(resume.basic.title);
  for (const e of resume.experience) {
    parts.push(e.company);
    parts.push(e.role);
    for (const b of e.bullets) parts.push(b);
  }
  for (const p of resume.projects) {
    parts.push(p.name);
    for (const b of p.bullets) parts.push(b);
  }
  for (const s of resume.skills) parts.push(s);
  return parts.join(' \n ').toLowerCase();
}

type Tone = 'green' | 'amber' | 'red';

const TONE_TRACK_CLASS: Record<Tone, string> = {
  green: 'bg-emerald-100',
  amber: 'bg-amber-100',
  red: 'bg-red-100',
};

const TONE_INDICATOR_CLASS: Record<Tone, string> = {
  green: '[&_[data-slot=progress-indicator]]:bg-emerald-600',
  amber: '[&_[data-slot=progress-indicator]]:bg-amber-500',
  red: '[&_[data-slot=progress-indicator]]:bg-red-500',
};

const TONE_TEXT_CLASS: Record<Tone, string> = {
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
};

const SEVERITY_BADGE_CLASS: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-700',
};

const IMPACT_BADGE_CLASS: Record<string, string> = {
  High: 'border-emerald-200 text-emerald-700',
  Medium: 'border-amber-200 text-amber-700',
  Low: 'border-slate-200 text-slate-700',
};

const IMPACT_LABEL: Record<string, string> = {
  High: '高影响',
  Medium: '中影响',
  Low: '低影响',
};

const SECTION_LABEL: Record<ResumeSection, string> = {
  skills: '技能',
  experience: '工作经历',
  projects: '项目经历',
  basic: '个人信息',
};

function coverageTone(percentage: number): Tone {
  if (percentage >= 70) return 'green';
  if (percentage >= 40) return 'amber';
  return 'red';
}

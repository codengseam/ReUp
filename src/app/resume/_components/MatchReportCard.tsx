'use client';

// src/app/resume/_components/MatchReportCard.tsx
// ReUp v2 Phase 4 P1 (H5): Match Report Cards UI.
//
// Renders a 4-card grid (Strengths / Gaps / Priorities / Missing Keywords)
// plus a Coverage progress bar at the top. Uses pre-computed ATS + Match
// Report results when passed as props (preferred for tests), or computes
// them on mount from the resume + JD otherwise. The LLM-based
// `generatePriorities` is intentionally NOT called here — the static
// DEFAULT_PRIORITIES are used so the component stays renderable on the
// client side without spinning up an LLM round-trip.

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Sparkles, Target, TrendingUp, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  computeAtsCoverage,
  extractJdKeywords,
  suggestSectionForKeyword,
} from '@/lib/resume/ats';
import { classifyDimensions, DEFAULT_PRIORITIES } from '@/lib/resume/matcher';
import type {
  ATSResult,
  MatchReport,
  ResumeDocument,
  ResumeSection,
} from '@/lib/resume/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MatchReportCardProps {
  resume: ResumeDocument;
  jd: string;
  /** Pre-computed ATS result. When omitted, computed via TF + coverage scan. */
  atsResult?: ATSResult;
  /** Pre-computed Match Report. When omitted, derived from `classifyDimensions`. */
  matchReport?: MatchReport;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FALLBACK_ATS: ATSResult = {
  jdKeywords: [],
  coverage: { hits: 0, total: 0, percentage: 0 },
  missing: [],
};

export function MatchReportCard({ resume, jd, atsResult, matchReport }: MatchReportCardProps) {
  // ATS: prefer pre-computed, otherwise fall back to a sync stub and compute
  // via extractJdKeywords (TF mode) on mount.
  const [computedAts, setComputedAts] = useState<ATSResult | null>(atsResult ?? null);
  useEffect(() => {
    if (atsResult) {
      setComputedAts(atsResult);
      return;
    }
    let cancelled = false;
    void (async () => {
      const jdKeywords = await extractJdKeywords(jd);
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
    return () => {
      cancelled = true;
    };
  }, [resume, jd, atsResult]);

  const ats = computedAts ?? FALLBACK_ATS;

  // Match Report: synchronous — always derivable from classifyDimensions.
  const report = useMemo<MatchReport>(() => {
    if (matchReport) return matchReport;
    return buildReportSync(resume);
  }, [resume, matchReport]);

  const tone = coverageTone(ats.coverage.percentage);
  const toneTrackClass = TONE_TRACK_CLASS[tone];
  const toneTextClass = TONE_TEXT_CLASS[tone];
  const coverageLabel = `${ats.coverage.percentage.toFixed(1)}%`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Match Report · 匹配报告
          </CardTitle>
          <Badge
            variant="outline"
            className={`font-mono ${toneTextClass}`}
            aria-label={`Coverage ${coverageLabel}`}
          >
            Coverage {coverageLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress
          value={ats.coverage.percentage}
          aria-label="Keyword coverage percentage"
          aria-valuenow={ats.coverage.percentage}
          className={`${toneTrackClass} ${TONE_INDICATOR_CLASS[tone]}`}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StrengthsCard strengths={report.strengths} />
          <GapsCard gaps={report.gaps} />
          <PrioritiesCard priorities={report.priorities} />
          <MissingKeywordsCard missing={ats.missing} />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-cards
// ---------------------------------------------------------------------------

function StrengthsCard({ strengths }: { strengths: MatchReport['strengths'] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
        Strengths · 优势 ({strengths.length})
      </div>
      {strengths.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无明显优势，建议补充关键词</p>
      ) : (
        <ul className="space-y-2">
          {strengths.map((s) => (
            <li key={s.dimension} className="flex items-start gap-2">
              <span
                data-slot="strength-dot"
                aria-hidden="true"
                className="mt-1.5 w-2 h-2 rounded-full bg-emerald-500 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{s.dimension}</p>
                {s.evidence && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    {s.evidence}
                  </p>
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
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
        Gaps · 短板 ({gaps.length})
      </div>
      {gaps.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无明显短板</p>
      ) : (
        <ul className="space-y-2">
          {gaps.map((g) => (
            <li key={g.dimension} className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground truncate">{g.dimension}</p>
              <Badge
                className={SEVERITY_BADGE_CLASS[g.severity]}
                aria-label={`Severity ${g.severity}`}
              >
                {g.severity}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrioritiesCard({ priorities }: { priorities: MatchReport['priorities'] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        Top 3 Priorities · 优先级建议
      </div>
      <ol className="space-y-2 list-none">
        {priorities.map((p) => (
          <li key={p.rank} className="flex items-start gap-2">
            <span className="text-xs font-mono font-semibold text-foreground shrink-0 w-5">
              {p.rank}.
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground leading-relaxed">{p.action}</p>
              <Badge
                variant="outline"
                className={`mt-1 text-[10px] ${IMPACT_BADGE_CLASS[p.expectedImpact] ?? ''}`}
                aria-label={`Expected impact ${p.expectedImpact}`}
              >
                {p.expectedImpact}
              </Badge>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MissingKeywordsCard({
  missing,
}: {
  missing: ATSResult['missing'];
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <XCircle className="w-3.5 h-3.5 text-red-600" />
        Missing Keywords · 缺失关键词 ({missing.length})
      </div>
      {missing.length === 0 ? (
        <p className="text-xs text-muted-foreground">所有关键词都已覆盖</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {missing.map((m) => (
            <span
              key={m.term}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground"
            >
              <span className="font-medium">{m.term}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {SECTION_LABEL[m.suggestedSection]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

type Tone = 'green' | 'amber' | 'red';

const TONE_TRACK_CLASS: Record<Tone, string> = {
  green: 'bg-emerald-100',
  amber: 'bg-amber-100',
  red: 'bg-red-100',
};

// Override the radix indicator color via an arbitrary attribute selector.
const TONE_INDICATOR_CLASS: Record<Tone, string> = {
  green: '[&_[data-slot=progress-indicator]]:bg-emerald-600',
  amber: '[&_[data-slot=progress-indicator]]:bg-amber-500',
  red: '[&_[data-slot=progress-indicator]]:bg-red-500',
};

// For the badge text (Coverage X%).
const TONE_TEXT_CLASS: Record<Tone, string> = {
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
};

const SEVERITY_BADGE_CLASS: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100',
  medium: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100',
  low: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100',
};

const IMPACT_BADGE_CLASS: Record<string, string> = {
  High: 'border-emerald-200 text-emerald-700',
  Medium: 'border-amber-200 text-amber-700',
  Low: 'border-slate-200 text-slate-700',
};

const SECTION_LABEL: Record<ResumeSection, string> = {
  skills: 'skills',
  experience: 'experience',
  projects: 'projects',
  basic: 'basic',
};

function coverageTone(percentage: number): Tone {
  if (percentage >= 70) return 'green';
  if (percentage >= 40) return 'amber';
  return 'red';
}

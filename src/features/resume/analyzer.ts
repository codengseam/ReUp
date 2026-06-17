// src/features/resume/analyzer.ts
// ReUp v2 Phase 1 (Task 1.4): unified resume analysis pipeline.
//
// Orchestrates diagnostics, ATS keyword adaptation, and match-report
// generation. Individual pipeline failures are caught and logged so they
// never block the whole analysis.

import type { ResumeDocument, ATSResult, MatchReport } from './types';
import type { JDDocument } from '@/features/jd/types';
import type { DiagnosticResult } from './diagnostics';
import type { LLMClient } from '@/server/llm/llm-client';
import { runDiagnostics } from './diagnostics';
import { extractJdKeywords, computeAtsCoverage, suggestSectionForKeyword } from './ats';
import { classifyDimensions, generatePriorities } from './matcher';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function termInResume(resume: ResumeDocument, term: string): boolean {
  return resume.raw.toLowerCase().includes(term.toLowerCase());
}

function severityFromDimension(dimension: string): 'high' | 'medium' | 'low' {
  const high = ['晋升底层逻辑', '面试准备', '述职答辩'];
  const medium = ['亮点挖掘', '简历优化', 'JD匹配'];
  if (high.includes(dimension)) return 'high';
  if (medium.includes(dimension)) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

export async function analyzeResume(
  resume: ResumeDocument,
  jd: JDDocument | null,
  options?: { llmClient?: LLMClient },
): Promise<{
  resume: ResumeDocument;
  jd: JDDocument | null;
  ats: ATSResult | null;
  match: MatchReport | null;
  diagnostics: DiagnosticResult;
}> {
  // Diagnostics always runs (no JD dependency, no LLM dependency)
  const diagnostics = runDiagnostics(resume);

  let ats: ATSResult | null = null;
  let match: MatchReport | null = null;

  if (jd) {
    // ── ATS and Match pipelines run in parallel (independent) ──
    const [atsResult, matchResult] = await Promise.allSettled([
      // ── ATS pipeline ──
      (async (): Promise<ATSResult> => {
        const jdKeywords = await extractJdKeywords(jd.raw, { llmClient: options?.llmClient });
        const coverage = computeAtsCoverage(resume, jdKeywords);
        const missing = jdKeywords
          .filter((kw) => !termInResume(resume, kw.term))
          .map((kw) => ({ term: kw.term, suggestedSection: suggestSectionForKeyword(kw.term) }));
        return { jdKeywords, coverage, missing };
      })(),
      // ── Match pipeline ──
      (async (): Promise<MatchReport> => {
        const dimensions = classifyDimensions(resume);
        const strengths: MatchReport['strengths'] = Object.entries(dimensions)
          .filter(([, d]) => d.score > 0)
          .map(([dimension, d]) => ({ dimension, evidence: d.evidence }));
        const gaps: MatchReport['gaps'] = Object.entries(dimensions)
          .filter(([, d]) => d.score === 0)
          .map(([dimension]) => ({
            dimension,
            severity: severityFromDimension(dimension),
          }));
        const partialMatch = { strengths, gaps };
        const priorities = await generatePriorities(resume, partialMatch, {
          llmClient: options?.llmClient,
        });
        return { ...partialMatch, priorities };
      })(),
    ]);

    if (atsResult.status === 'fulfilled') {
      ats = atsResult.value;
    }
    if (matchResult.status === 'fulfilled') {
      match = matchResult.value;
    }
  }

  return { resume, jd, ats, match, diagnostics };
}
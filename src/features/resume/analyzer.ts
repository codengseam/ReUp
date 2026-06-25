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
import { generatePriorities, buildMatchReportFromJD, computeOverallMatchScore } from './matcher';
import { analyzeJD, type JDAnalysis } from '@/features/jd/analyzer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function termInResume(resume: ResumeDocument, term: string): boolean {
  return resume.raw.toLowerCase().includes(term.toLowerCase());
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

export async function analyzeJDOnly(
  jd: JDDocument,
  options?: { llmClient?: LLMClient },
): Promise<{
  resume: null;
  jd: JDDocument;
  ats: null;
  match: null;
  diagnostics: null;
  jdAnalysis: JDAnalysis;
}> {
  const jdAnalysis = await analyzeJD(jd, { llmClient: options?.llmClient });
  return { resume: null, jd, ats: null, match: null, diagnostics: null, jdAnalysis };
}

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
  jdAnalysis: JDAnalysis | null;
}> {
  // Diagnostics always runs (no JD dependency, no LLM dependency)
  const diagnostics = runDiagnostics(resume);

  let ats: ATSResult | null = null;
  let match: MatchReport | null = null;
  let jdAnalysis: JDAnalysis | null = null;

  if (jd) {
    // ── ATS, Match and JD analysis pipelines run in parallel ──
    const [atsResult, matchResult, jdAnalysisResult] = await Promise.allSettled([
      // ── ATS pipeline ──
      (async (): Promise<ATSResult> => {
        const jdKeywords = await extractJdKeywords(jd.raw, { llmClient: options?.llmClient });
        const coverage = computeAtsCoverage(resume, jdKeywords);
        const missing = jdKeywords
          .filter((kw) => !termInResume(resume, kw.term))
          .map((kw) => ({ term: kw.term, suggestedSection: suggestSectionForKeyword(kw.term) }));
        return { jdKeywords, coverage, missing };
      })(),
      // ── Match pipeline (JD-driven) ──
      (async (): Promise<MatchReport> => {
        const partialMatch = buildMatchReportFromJD(resume, jd);
        // generatePriorities is the only LLM-dependent step; if it fails,
        // we still want strengths/gaps + overallScore to survive.
        let priorities: MatchReport['priorities'] = [];
        try {
          priorities = await generatePriorities(resume, partialMatch, {
            llmClient: options?.llmClient,
          });
        } catch {
          // priorities stays [], MatchReport.priorities defaults to []
        }
        const overallScore = computeOverallMatchScore(partialMatch, jd);
        return { ...partialMatch, priorities, overallScore };
      })(),
      // ── JD expert analysis ──
      (async (): Promise<JDAnalysis> => {
        return analyzeJD(jd, { llmClient: options?.llmClient });
      })(),
    ]);

    if (atsResult.status === 'fulfilled') {
      ats = atsResult.value;
    }
    if (matchResult.status === 'fulfilled') {
      match = matchResult.value;
    }
    if (jdAnalysisResult.status === 'fulfilled') {
      jdAnalysis = jdAnalysisResult.value;
    }
  }

  return { resume, jd, ats, match, diagnostics, jdAnalysis };
}
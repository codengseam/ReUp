import type { ResumeDocument } from '../types';
import type { DiagnosticIssue, DiagnosticResult } from './types';
import { detectTypos } from './typo';
import { detectTimelineConflicts } from './timeline';
import { detectFormatIssues } from './format';
import { detectContradictions } from './contradiction';
import { detectImpactIssues } from './impact';
import { detectReadabilityIssues } from './readability';
import { detectCareerIssues } from './career';

// Re-export types
export type { DiagnosticIssue, DiagnosticResult } from './types';

// ─── Orchestration ──────────────────────────────────────────────────────

function buildSummary(issues: DiagnosticIssue[]): DiagnosticResult['summary'] {
  return {
    total: issues.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}

/**
 * Run all diagnostic checks on a resume document.
 * Aggregates results from typo, timeline, format, contradiction, impact,
 * readability, and career detectors.
 */
export function runDiagnostics(resume: ResumeDocument): DiagnosticResult {
  const issues = [
    ...detectTypos(resume.raw),
    ...detectTimelineConflicts(resume),
    ...detectFormatIssues(resume),
    ...detectContradictions(resume),
    ...detectImpactIssues(resume),
    ...detectReadabilityIssues(resume),
    ...detectCareerIssues(resume),
  ];

  return {
    issues,
    summary: buildSummary(issues),
  };
}

// Re-export individual detectors for direct use
export { detectTypos } from './typo';
export { detectTimelineConflicts } from './timeline';
export { detectFormatIssues } from './format';
export { detectContradictions } from './contradiction';
export { detectImpactIssues } from './impact';
export { detectReadabilityIssues } from './readability';
export { detectCareerIssues } from './career';
// ─── Shared types for diagnostics modules ───────────────────────────────

export interface DiagnosticIssue {
  type: 'typo' | 'timeline' | 'format' | 'contradiction';
  severity: 'error' | 'warning' | 'info';
  message: string;
  location: string; // e.g. "experience[0].bullets[2]"
  suggestion?: string;
}

export interface DiagnosticResult {
  issues: DiagnosticIssue[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
  };
}
// src/lib/resume/types.ts
// ReUp v2 Phase 3 P0 (A1): shared schema for all resume parsers.
// PDF / Word / Markdown / Text parsers all import from here.

export type ResumeSource = 'pdf' | 'word' | 'md' | 'text';

export interface ResumeMeta {
  version: string;
  source: ResumeSource;
  createdAt: string; // ISO 8601
}

export interface ResumeBasic {
  name?: string;
  title?: string;
  yearsOfExperience?: number;
  contact?: Record<string, string>;
}

export interface ResumeExperience {
  company: string;
  role: string;
  period: string;
  bullets: string[];
}

export interface ResumeProject {
  name: string;
  period?: string;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  period: string;
}

export interface ResumeDocument {
  meta: ResumeMeta;
  basic: ResumeBasic;
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skills: string[];
  education: ResumeEducation[];
  raw: string;
}

export const RESUME_SCHEMA_VERSION = 'reup.v2.phase3';

// ---------------------------------------------------------------------------
// Phase 4 P1 (C1-C3, D1-D3): ATS adaptation + Match Report shapes.
// ---------------------------------------------------------------------------

/** Section hints for where a missing JD keyword should be inserted. */
export type ResumeSection = 'basic' | 'experience' | 'projects' | 'skills';

/** Output of the ATS adaptation pipeline. */
export type ATSResult = {
  /** Top-K keywords/phrases extracted from the JD, sorted by weight desc. */
  jdKeywords: Array<{ term: string; weight: number }>;
  coverage: {
    /** Sum of weights of keywords that were found in the resume. */
    hits: number;
    /** Sum of all keyword weights. */
    total: number;
    /** hits / total * 100, rounded to 1 decimal. */
    percentage: number;
  };
  /** JD keywords that did NOT hit, with a suggested section to add them to. */
  missing: Array<{ term: string; suggestedSection: ResumeSection }>;
};

/** Output of the Match Report pipeline. */
export type MatchReport = {
  strengths: Array<{ dimension: string; evidence: string }>;
  gaps: Array<{ dimension: string; severity: 'high' | 'medium' | 'low' }>;
  priorities: Array<{ rank: 1 | 2 | 3; action: string; expectedImpact: string }>;
};

/**
 * Build a meta block. Centralised so the dispatcher and any future
 * parser can stamp the same shape without drift.
 */
export function parseResumeMeta(source: ResumeSource, createdAt: string = new Date().toISOString()): ResumeMeta {
  return {
    version: RESUME_SCHEMA_VERSION,
    source,
    createdAt,
  };
}

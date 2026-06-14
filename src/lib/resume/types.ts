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

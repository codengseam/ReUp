// src/lib/review/types.ts
// ReUp v2: Interview Review module — shared types.

export type InterviewType = 'TECHNICAL' | 'BEHAVIORAL' | 'CASE' | 'SYSTEM_DESIGN' | 'MIXED';

export type Verdict = 'strong_hire' | 'hire' | 'lean_hire' | 'lean_no_hire' | 'no_hire' | 'strong_no_hire';

export interface ReviewDimensions {
  technicalDepth: number;
  communication: number;
  problemSolving: number;
  projectMastery: number;
  behavioralFit: number;
  systemDesign?: number;
}

export interface GreatMoment {
  questionId: string;
  snippet: string;
  why: string;
}

export type IssueSeverity = 'critical' | 'major' | 'minor';
export type IssueCategory = 'knowledge_gap' | 'communication' | 'depth' | 'edge_case' | 'tradeoff' | 'behavioral_red_flag';

export interface TopIssue {
  questionId: string;
  severity: IssueSeverity;
  category: IssueCategory;
  snippet: string;
  problem: string;
  suggestion: string;
  referenceAnswer?: string;
}

export interface PerQuestionEvaluation {
  accuracy: number;
  depth: number;
  clarity: number;
  structure: number;
}

export interface PerQuestionFeedback {
  questionId: string;
  score: number;
  evaluation: PerQuestionEvaluation;
  whatWentWell: string[];
  whatToImprove: string[];
  modelAnswer?: string;
  followups?: string[];
}

export interface ActionableItem {
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2';
  estimatedHours: number;
  resources?: string[];
}

export interface InterviewTranscriptQuestion {
  questionId: string;
  question: string;
  category: string;
  difficulty: number;
  userAnswer: string;
  referenceAnswer?: string;
}

export interface ReviewInput {
  sessionId: string;
  userId: string;
  transcript: InterviewTranscriptQuestion[];
  interviewType: InterviewType;
  level: string;
  difficulty: number;
  jdSummary?: string;
  resumeHighlights?: string;
  ragChunks?: string[];
}

export interface LLMReviewOutput {
  summary: string;
  overall_score: number;
  overall_verdict: Verdict;
  dimensions: ReviewDimensions;
  great_moments: GreatMoment[];
  top_issues: TopIssue[];
  per_question_feedback: PerQuestionFeedback[];
  actionable_items: ActionableItem[];
}

export interface ReviewTrace {
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  totalLatencyMs: number;
  ragChunksUsed: number;
}

export interface ReviewResult {
  sessionId: string;
  userId: string;
  overallScore: number;
  overallVerdict: Verdict;
  summary: string;
  dimensions: ReviewDimensions;
  greatMoments: GreatMoment[];
  topIssues: TopIssue[];
  perQuestionFeedback: PerQuestionFeedback[];
  actionableItems: ActionableItem[];
  trace: ReviewTrace;
  createdAt: string;
}
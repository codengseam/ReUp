// src/shared/types/interview.ts
// Shared types for interview transcript and analysis

export interface InterviewTranscriptQuestion {
  questionId: string;
  question: string;
  category: string;
  difficulty: number;
  userAnswer: string;
  referenceAnswer?: string;
}

export interface InterviewTranscript {
  id: string;
  company?: string;
  position?: string;
  round?: string;
  questions: InterviewTranscriptQuestion[];
  result?: 'passed' | 'failed' | 'waiting';
  rawText: string;
  createdAt: string;
}

export interface PerQuestionAnalysis {
  questionId: string;
  question: string;
  intent: string;
  userAnswer: string;
  evaluation: {
    strengths: string[];
    weaknesses: string[];
  };
  improvedAnswer: string;
  knowledgePoints: string[];
}

export interface ComprehensiveAnalysis {
  transcriptId: string;
  company?: string;
  position?: string;
  round?: string;
  overallScore: number;
  summary: string;
  perQuestionAnalysis: PerQuestionAnalysis[];
  commonIssues: string[];
  resumeGaps?: string[];
  createdAt: string;
}
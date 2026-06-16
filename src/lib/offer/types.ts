// src/lib/offer/types.ts
// Offer Probability Analysis — type definitions.

export type Level = '校招' | 'P5' | 'P6' | 'P7' | 'P8';
export type CompanyTier = 'BAT/TMD' | '独角兽' | '中型' | 'Startup' | '外企';
export type FactorCategory = 'qualification' | 'match' | 'market' | 'performance' | 'compensation';
export type FactorStatus = 'positive' | 'neutral' | 'negative';
export type ActualResult = 'offer' | 'rejected' | 'pending' | 'withdrawn';

export interface OfferFactor {
  factor: string;
  category: FactorCategory;
  weight: number;        // 0-1
  score: number;         // 0-1
  contribution: number;  // weight * score
  evidence: string;
  status: FactorStatus;
}

export interface PredictionInterval {
  low: number;
  high: number;
}

export interface OfferRisk {
  risk: string;
  impact: number;        // percentage points
  howToMitigate: string;
}

export interface OfferStrength {
  strength: string;
  impact: number;
}

export interface ImprovementAction {
  action: string;
  potentialLift: number;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedHours: number;
}

export interface OfferPredictionInput {
  userId: string;
  jdId?: string;
  resumeId?: string;
  interviewSessionId?: string;
  level: Level;
  yearsOfExperience: number;
  matchScore?: number;       // 0-10 from ResumeJDMatch
  interviewScore?: number;   // 0-10 from InterviewReview
  expectedSalary?: number;
  companyInfo?: {
    name: string;
    tier: CompanyTier;
    fundingStage?: string;
  };
  jdLevel?: string;          // JD's target level
  jdMinYears?: number;       // JD's required years
}

export interface OfferPredictionResult {
  id: string;
  userId: string;
  jdId?: string;
  resumeId?: string;
  interviewSessionId?: string;
  probability: number;
  confidence: number;
  predictionInterval: PredictionInterval;
  breakdown: OfferFactor[];
  topRisks: OfferRisk[];
  topStrengths: OfferStrength[];
  improvementActions: ImprovementAction[];
  modelVersion: string;
  llmTrace: { modelUsed: string; inputTokens: number; outputTokens: number; totalLatencyMs: number };
  createdAt: string;
}
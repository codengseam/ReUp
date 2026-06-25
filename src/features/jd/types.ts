export interface JDDocument {
  meta: {
    source: 'text' | 'llm';
    parsedAt: string;
  };
  title: string;
  department?: string;
  level?: string;
  location?: string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  hardRequirements: Array<{
    category: '学历' | '经验' | '技能' | '证书' | '其他';
    description: string;
    priority: 'must' | 'preferred';
  }>;
  responsibilities: string[];
  skills: Array<{
    name: string;
    level: '精通' | '熟悉' | '了解';
    required: boolean;
  }>;
  team?: {
    size?: string;
    structure?: string;
    culture?: string[];
  };
  focusPoints?: Array<{
    dimension: string;
    description: string;
    weight: 'high' | 'medium' | 'low';
  }>;
  raw: string;
}

export interface SmartMatchResult {
  overallScore: number;
  dimensionScores: Array<{
    dimension: string;
    score: number;
    resumeEvidence: string;
    jdRequirement: string;
    gap?: string;
  }>;
  redFlags: string[];
  greenFlags: string[];
  suggestions: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    targetSection: 'basic' | 'experience' | 'projects' | 'skills';
  }>;
}
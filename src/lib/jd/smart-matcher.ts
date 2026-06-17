import type { ResumeDocument } from '../resume/types';
import type { JDDocument, SmartMatchResult } from './types';

/**
 * Compare a parsed resume against a structured JD and return a detailed
 * match result with dimension scores, flags, and suggestions.
 */
export function smartMatch(resume: ResumeDocument, jd: JDDocument): SmartMatchResult {
  const dimensionScores: SmartMatchResult['dimensionScores'] = [];
  const greenFlags: string[] = [];
  const redFlags: string[] = [];
  const suggestions: SmartMatchResult['suggestions'] = [];

  // ---- Skill match ----
  const resumeSkills = new Set(resume.skills.map((s) => s.toLowerCase()));
  const matchedSkills = jd.skills.filter((s) => resumeSkills.has(s.name.toLowerCase()));
  const missingRequired = jd.skills.filter(
    (s) => s.required && !resumeSkills.has(s.name.toLowerCase()),
  );
  const skillScore =
    jd.skills.length > 0
      ? Math.round((matchedSkills.length / jd.skills.length) * 100)
      : 100;

  dimensionScores.push({
    dimension: '技能',
    score: skillScore,
    resumeEvidence: `掌握: ${matchedSkills.map((s) => s.name).join(', ') || '无匹配'}`,
    jdRequirement: `要求: ${jd.skills.map((s) => s.name).join(', ') || '无明确要求'}`,
    gap:
      missingRequired.length > 0
        ? `缺失: ${missingRequired.map((s) => s.name).join(', ')}`
        : undefined,
  });

  if (missingRequired.length > 0) {
    suggestions.push({
      priority: 'high',
      action: `补充技能: ${missingRequired.map((s) => s.name).join(', ')}`,
      targetSection: 'skills',
    });
  }

  // ---- Experience match ----
  const years = resume.basic.yearsOfExperience ?? 0;
  const expReq = jd.hardRequirements.find((r) => r.category === '经验');
  const requiredYears = expReq ? parseInt(expReq.description.match(/\d+/)?.[0] || '0', 10) : 0;
  const expScore =
    requiredYears > 0 ? Math.min(100, Math.round((years / requiredYears) * 100)) : 100;

  dimensionScores.push({
    dimension: '经验',
    score: expScore,
    resumeEvidence: `${years}年工作经验`,
    jdRequirement: expReq?.description || '无明确要求',
    gap: years < requiredYears ? `差 ${requiredYears - years} 年` : undefined,
  });

  if (years > 0 && years >= requiredYears) {
    greenFlags.push(`经验满足: ${years} 年 >= 要求 ${requiredYears} 年`);
  } else if (requiredYears > 0) {
    redFlags.push(`经验不足: 要求 ${requiredYears} 年，实际 ${years} 年`);
  }

  // ---- Education match ----
  const eduReq = jd.hardRequirements.find((r) => r.category === '学历');
  const hasDegree = resume.education.length > 0;
  const eduScore = eduReq ? (hasDegree ? 100 : 0) : 100;

  dimensionScores.push({
    dimension: '学历',
    score: eduScore,
    resumeEvidence: hasDegree ? (resume.education[0]?.degree ?? '已填写') : '未填写',
    jdRequirement: eduReq?.description || '无明确要求',
  });

  if (!hasDegree && eduReq) {
    redFlags.push('学历不满足要求');
  }

  // ---- Overall score ----
  const overallScore = Math.round(
    dimensionScores.reduce((sum, d) => sum + d.score, 0) / dimensionScores.length,
  );

  return {
    overallScore,
    dimensionScores,
    redFlags,
    greenFlags,
    suggestions,
  };
}
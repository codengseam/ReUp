import prisma from '@/lib/db';
import type { ReviewResult } from './types';

export async function saveReview(result: ReviewResult): Promise<void> {
  await prisma.interviewReview.create({
    data: {
      id: result.sessionId + '_review',
      sessionId: result.sessionId,
      userId: result.userId,
      overallScore: result.overallScore,
      overallVerdict: result.overallVerdict,
      summary: result.summary,
      dimensions: JSON.stringify(result.dimensions),
      dimensionWeights: JSON.stringify({}),
      greatMoments: JSON.stringify(result.greatMoments),
      topIssues: JSON.stringify(result.topIssues),
      perQuestionFeedback: JSON.stringify(result.perQuestionFeedback),
      actionableItems: JSON.stringify(result.actionableItems),
      llmTrace: JSON.stringify(result.trace),
      modelVersion: 'v1',
    },
  });
}

export async function getReview(sessionId: string): Promise<ReviewResult | null> {
  const record = await prisma.interviewReview.findUnique({ where: { sessionId } });
  if (!record) return null;
  return {
    sessionId: record.sessionId,
    userId: record.userId,
    overallScore: record.overallScore,
    overallVerdict: record.overallVerdict as ReviewResult['overallVerdict'],
    summary: record.summary,
    dimensions: JSON.parse(record.dimensions),
    greatMoments: JSON.parse(record.greatMoments),
    topIssues: JSON.parse(record.topIssues),
    perQuestionFeedback: JSON.parse(record.perQuestionFeedback),
    actionableItems: JSON.parse(record.actionableItems),
    trace: JSON.parse(record.llmTrace),
    createdAt: record.createdAt.toISOString(),
  };
}

export async function getUserReviews(userId: string, limit = 20): Promise<ReviewResult[]> {
  const records = await prisma.interviewReview.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return records.map(record => ({
    sessionId: record.sessionId,
    userId: record.userId,
    overallScore: record.overallScore,
    overallVerdict: record.overallVerdict as ReviewResult['overallVerdict'],
    summary: record.summary,
    dimensions: JSON.parse(record.dimensions),
    greatMoments: JSON.parse(record.greatMoments),
    topIssues: JSON.parse(record.topIssues),
    perQuestionFeedback: JSON.parse(record.perQuestionFeedback),
    actionableItems: JSON.parse(record.actionableItems),
    trace: JSON.parse(record.llmTrace),
    createdAt: record.createdAt.toISOString(),
  }));
}
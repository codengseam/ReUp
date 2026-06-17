import prisma from '@/server/db/db';
import type { OfferPredictionResult } from './types';

export async function savePrediction(result: OfferPredictionResult): Promise<void> {
  await prisma.offerPrediction.create({
    data: {
      id: result.id,
      userId: result.userId,
      jdId: result.jdId,
      resumeId: result.resumeId,
      interviewSessionId: result.interviewSessionId,
      probability: result.probability,
      confidence: result.confidence,
      predictionInterval: JSON.stringify(result.predictionInterval),
      breakdown: JSON.stringify(result.breakdown),
      topRisks: JSON.stringify(result.topRisks),
      topStrengths: JSON.stringify(result.topStrengths),
      improvementActions: JSON.stringify(result.improvementActions),
      modelVersion: result.modelVersion,
      llmTrace: JSON.stringify(result.llmTrace),
    },
  });
}

export async function getPrediction(id: string): Promise<OfferPredictionResult | null> {
  const record = await prisma.offerPrediction.findUnique({ where: { id } });
  if (!record) return null;
  return deserializePrediction(record);
}

export async function getUserPredictions(userId: string, limit = 20): Promise<OfferPredictionResult[]> {
  const records = await prisma.offerPrediction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return records.map(deserializePrediction);
}

function deserializePrediction(record: Record<string, unknown>): OfferPredictionResult {
  return {
    id: record.id,
    userId: record.userId,
    jdId: record.jdId,
    resumeId: record.resumeId,
    interviewSessionId: record.interviewSessionId,
    probability: record.probability,
    confidence: record.confidence,
    predictionInterval: JSON.parse(record.predictionInterval),
    breakdown: JSON.parse(record.breakdown),
    topRisks: JSON.parse(record.topRisks),
    topStrengths: JSON.parse(record.topStrengths),
    improvementActions: JSON.parse(record.improvementActions),
    modelVersion: record.modelVersion,
    llmTrace: JSON.parse(record.llmTrace),
    createdAt: record.createdAt.toISOString(),
  };
}
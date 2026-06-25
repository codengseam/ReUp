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
    id: record.id as string,
    userId: record.userId as string,
    jdId: record.jdId as string,
    resumeId: record.resumeId as string | undefined,
    interviewSessionId: record.interviewSessionId as string | undefined,
    probability: record.probability as number,
    confidence: record.confidence as number,
    predictionInterval: JSON.parse(record.predictionInterval as string),
    breakdown: JSON.parse(record.breakdown as string),
    topRisks: JSON.parse(record.topRisks as string),
    topStrengths: JSON.parse(record.topStrengths as string),
    improvementActions: JSON.parse(record.improvementActions as string),
    modelVersion: record.modelVersion as string,
    llmTrace: JSON.parse(record.llmTrace as string),
    createdAt: (record.createdAt as Date).toISOString(),
  };
}
import { retrieve } from '@/server/rag/rag';
import { createLogger } from '@/server/logger';

const logger = createLogger('interview:analysis:rag-enricher');

export interface EnrichedKnowledge {
  question: string;
  relevantConcepts: Array<{
    title: string;
    content: string;
    source: string;
  }>;
}

/**
 * Enrich interview question analysis with RAG-powered knowledge retrieval.
 * Searches the knowledge base for relevant concepts related to the question.
 * Returns empty results on failure to avoid blocking the analysis pipeline.
 */
export async function enrichWithRAG(
  question: string,
  topK: number = 3
): Promise<EnrichedKnowledge> {
  try {
    const ragResponse = await retrieve(question, topK);

    const relevantConcepts = ragResponse.results
      .filter((r) => r.content && r.content.length > 0)
      .slice(0, topK)
      .map((r) => ({
        title: r.docId ?? r.source ?? '相关知识',
        content: r.content,
        source: r.source ?? r.category ?? '知识库',
      }));

    return {
      question,
      relevantConcepts,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn(
      `RAG enrichment failed for question: ${errorMessage}`
    );
    return {
      question,
      relevantConcepts: [],
    };
  }
}

/**
 * Batch enrich multiple questions with RAG knowledge.
 * Each question is enriched independently; failures are isolated.
 */
export async function enrichBatchWithRAG(
  questions: string[],
  topK: number = 3
): Promise<EnrichedKnowledge[]> {
  const results = await Promise.all(
    questions.map((q) => enrichWithRAG(q, topK))
  );
  return results;
}
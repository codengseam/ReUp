// src/lib/rag.ts - 临时 shim，新代码请从 '@/lib/rag' 导入
// 重构背景：rag.ts 单文件 1300+ 行拆为 src/lib/rag/{index,types,cache,search,route,safety,assess,suggestions,_retrieve-internal}.ts
// 保持所有原导出（retrieve / inputGuard / outputGuard / hallucinationCheck / assessConfidence / RAGResult / RAGResponse / Citation / SafetyCheckResult / contentSafetyCheck / outputSafetyCheck / getInputSuggestions / HOT_QUERIES / getCacheKey / getCached / setCache / searchCache 等）向后兼容。
export * from './rag/index';

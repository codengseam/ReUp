// Re-export server-side admin stats so that all code paths write to the same file.
export {
  recordRAGRetrieve,
  recordChatAPICall,
  recordInputGuardBlocked,
  recordOutputGuardBlocked,
  getAdminStats,
  type AdminStatsData,
  type AdminStats,
} from '@/server/db/admin-stats';

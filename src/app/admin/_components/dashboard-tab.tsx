'use client';
import React, { useState, useEffect } from 'react';
import {
  Database, Zap, Activity, Shield, ArrowRight,
  PenLine, Cpu, SlidersHorizontal, Tags,
} from 'lucide-react';
import type { TabKey } from '../_lib/types';
import { BUILTIN_MODELS } from '../_lib/constants';
import { useAdminState } from '../_hooks/use-admin-state';
import { LS_KEYS } from '../_lib/constants';
import type { CustomProvider, ActivityLog } from '../_lib/types';
import { formatRelativeTime } from '../_lib/utils';

interface DashboardProps {
  onNavigate: (tab: TabKey) => void;
}

interface AdminStats {
  ragRetrieveCount: number;
  chatApiCallCount: number;
  avgResponseTimeMs: number;
  inputGuardBlockedCount: number;
  outputGuardBlockedCount: number;
  serviceStartTime: number;
}

interface KnowledgeStats {
  total: number;
  bySkill: Array<{ name: string; count: number }>;
}

export default function DashboardTab({ onNavigate }: DashboardProps) {
  const [customModels] = useAdminState<CustomProvider[]>(LS_KEYS.customModels, []);
  const [activityLog] = useAdminState<ActivityLog[]>(LS_KEYS.activityLog, []);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [chunkCount, setChunkCount] = useState<number>(0);
  const [skillCount, setSkillCount] = useState<number>(0);
  const [loadingStats, setLoadingStats] = useState(true);

  const totalModels = BUILTIN_MODELS.length + customModels.length;

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoadingStats(true);
      try {
        // 加载服务端统计
        const statsRes = await fetch('/api/admin/stats');
        if (statsRes.ok && !cancelled) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        // 加载知识库 chunk 统计
        const kbRes = await fetch('/api/admin/knowledge?action=stats');
        if (kbRes.ok && !cancelled) {
          const kbData: KnowledgeStats = await kbRes.json();
          setChunkCount(kbData.total ?? 0);
          setSkillCount(kbData.bySkill?.length ?? 0);
        }
      } catch {
        // 静默失败，保持默认值
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  const avgResponseSec = stats ? (stats.avgResponseTimeMs / 1000).toFixed(1) : '0.0';
  const totalBlocked = stats ? stats.inputGuardBlockedCount + stats.outputGuardBlockedCount : 0;

  const statCards = [
    { icon: Database, label: '知识库 Chunk', value: String(chunkCount), trend: '全部已就绪', bg: 'bg-blue-500' },
    { icon: Zap, label: 'RAG 检索次数', value: String(stats?.ragRetrieveCount ?? 0), trend: '自服务启动以来', bg: 'bg-amber-500' },
    { icon: Activity, label: '平均响应时间', value: `${avgResponseSec}s`, trend: '自服务启动以来', bg: 'bg-green-500' },
    { icon: Shield, label: '安全拦截', value: String(totalBlocked), trend: '自服务启动以来', bg: 'bg-red-500' },
  ];

  const featureCards: Array<{ key: TabKey; icon: React.ElementType; title: string; desc: string; stat: string; statLabel: string; color: string }> = [
    { key: 'knowledge', icon: Database, title: '知识库管理', desc: '管理 RAG 知识库 chunk 索引，支持重新加载和搜索', stat: String(chunkCount), statLabel: 'Chunk', color: 'bg-blue-50 text-blue-600' },
    { key: 'prompt', icon: PenLine, title: '提示词管理', desc: '编辑系统提示词，控制 AI 角色和输出格式', stat: '1', statLabel: '活跃模板', color: 'bg-purple-50 text-purple-600' },
    { key: 'model', icon: Cpu, title: '模型配置', desc: '配置默认模型和可用模型白名单', stat: String(totalModels), statLabel: '可用模型', color: 'bg-green-50 text-green-600' },
    { key: 'rag', icon: SlidersHorizontal, title: 'RAG 参数', desc: '调整检索参数，优化知识库检索效果', stat: '7', statLabel: '可配置项', color: 'bg-amber-50 text-amber-600' },
    { key: 'metadata', icon: Tags, title: '元数据管理', desc: '按分类维度浏览 chunk 分布', stat: String(skillCount), statLabel: '分类数', color: 'bg-rose-50 text-rose-600' },
  ];

  const allActivity = activityLog.slice(0, 5);

  return (
    <div>
      {/* 统计概览 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map(s => (
          <div key={s.label} className="bg-white border border-border rounded-xl p-5 flex items-start gap-4 shadow-sm">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold text-foreground">
                {loadingStats && s.label !== '知识库 Chunk' ? (
                  <span className="inline-block w-8 h-4 bg-muted rounded animate-pulse" />
                ) : (
                  s.value
                )}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.trend}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 功能模块入口 */}
      <h3 className="text-sm font-semibold text-foreground mb-4">功能模块</h3>
      <div className="grid grid-cols-3 gap-5 mb-8">
        {featureCards.map(card => (
          <button key={card.key} onClick={() => onNavigate(card.key)}
            className="group text-left bg-white border border-border rounded-xl p-6 hover:border-primary/40 hover:shadow-md transition-all shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-lg ${card.color} flex items-center justify-center`}>
                <card.icon className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
            <h4 className="font-semibold text-sm text-foreground mb-1">{card.title}</h4>
            <p className="text-xs text-muted-foreground mb-4">{card.desc}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground">{card.stat}</span>
              <span className="text-xs text-muted-foreground">{card.statLabel}</span>
            </div>
          </button>
        ))}
      </div>

      {/* 最近活动 */}
      <h3 className="text-sm font-semibold text-foreground mb-4">最近活动</h3>
      <div className="bg-white border border-border rounded-xl divide-y divide-border shadow-sm">
        {allActivity.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">暂无活动记录</div>
        ) : (
          allActivity.map((a, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm text-foreground">{a.action}</span>
                <span className="text-sm text-muted-foreground">{a.target}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {a.time ? formatRelativeTime(a.time) : '-'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// src/app/admin/_components/experiments-tab.tsx
// M3: 实验管理 Tab
// - 列出所有实验
// - 查看 stats + 优化建议
// - 人工确认 (HITL): apply rollback / promote

'use client';
import React, { useEffect, useState } from 'react';
import {
  FlaskConical, CheckCircle2, AlertTriangle, Loader2, RefreshCcw,
  ChevronRight, Undo2, ArrowUp, Pause, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Experiment {
  id: number;
  version: string;
  experiment_id: string | null;
  traffic: number | null;
  is_active: number;
  is_experiment: number;
  created_at: number;
}

interface Suggestion {
  type: 'rollback' | 'promote' | 'tune_prompt' | 'expand_cohort' | 'pause';
  experiment_id: string;
  variant: string;
  confidence: number;
  rationale: string;
  metrics: {
    control_mean: number;
    variant_mean: number;
    p_value: number;
    sample_count: number;
  };
  auto_apply: false;
}

interface RollbackCheck {
  should_rollback: boolean;
  reason: string;
  control_mean: number;
  variant_mean: number;
  p_value: number;
  sample_count: { control: number; variant: number };
  in_gray_release: boolean;
}

interface ExperimentDetail {
  stats: {
    experiment_id: string;
    variant: string;
    started_at: number;
    control_scores: number[];
    variant_scores: number[];
  };
  suggestion: Suggestion | null;
  rollback_check: RollbackCheck | null;
}

const SUGGESTION_BADGE: Record<Suggestion['type'], { label: string; color: string; icon: React.ElementType }> = {
  rollback: { label: '回滚', color: 'bg-red-50 text-red-700 border-red-200', icon: Undo2 },
  promote: { label: '提升为主版本', color: 'bg-green-50 text-green-700 border-green-200', icon: ArrowUp },
  tune_prompt: { label: '调整 prompt', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: FlaskConical },
  expand_cohort: { label: '扩大样本', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: ChevronRight },
  pause: { label: '暂停 (样本不足)', color: 'bg-gray-50 text-gray-600 border-gray-200', icon: Pause },
};

export default function ExperimentsTab() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/experiments');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setExperiments(json.experiments ?? []);
      if (!selectedId && json.experiments?.[0]?.experiment_id) {
        setSelectedId(json.experiments[0].experiment_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/experiments?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载详情失败');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  const applySuggestion = async (suggestion: Suggestion) => {
    if (!approvedBy) {
      setActionMessage('❌ 请填入审批人 (approved_by)');
      return;
    }
    setActionMessage('执行中...');
    try {
      const res = await fetch('/api/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply_suggestion',
          suggestion,
          approved_by: approvedBy,
        }),
      });
      const json = await res.json();
      setActionMessage(res.ok ? `✅ 已应用: ${JSON.stringify(json)}` : `❌ ${json.error}`);
      if (res.ok) load();
    } catch (err) {
      setActionMessage(`❌ ${err instanceof Error ? err.message : '执行失败'}`);
    }
  };

  const forceRollback = async () => {
    if (!selectedId || !approvedBy) {
      setActionMessage('❌ 缺少 experiment_id 或审批人');
      return;
    }
    setActionMessage('执行中...');
    try {
      const res = await fetch('/api/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'force_rollback',
          experiment_id: selectedId,
          approved_by: approvedBy,
          reason: 'manual force rollback',
        }),
      });
      const json = await res.json();
      setActionMessage(res.ok ? `✅ 已回滚: ${JSON.stringify(json)}` : `❌ ${json.error}`);
      if (res.ok) load();
    } catch (err) {
      setActionMessage(`❌ ${err instanceof Error ? err.message : '执行失败'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">加载实验列表...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">实验管理 (HITL)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            auto_apply 永远 false, 必须人工确认后才执行回滚 / 提升
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCcw className="w-3.5 h-3.5" />
          刷新
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 左侧: 实验列表 */}
        <div className="md:col-span-1 bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted/30 text-xs font-medium border-b border-border">
            实验列表 ({experiments.length})
          </div>
          {experiments.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              暂无实验
            </div>
          ) : (
            <ul>
              {experiments.map((exp) => (
                <li key={exp.id}>
                  <button
                    onClick={() => setSelectedId(exp.experiment_id ?? '')}
                    className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-muted/20 ${
                      selectedId === exp.experiment_id ? 'bg-muted/30' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-xs">{exp.version}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(exp.created_at * 1000).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      实验 ID: {exp.experiment_id ?? '—'} · 流量: {((exp.traffic ?? 0) * 100).toFixed(0)}%
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 右侧: 详情 + 操作 */}
        <div className="md:col-span-2 space-y-4">
          {!selectedId ? (
            <div className="bg-muted/20 px-3 py-6 rounded-lg text-center text-sm text-muted-foreground">
              选择左侧的实验查看详情
            </div>
          ) : loadingDetail ? (
            <div className="flex items-center gap-2 text-muted-foreground px-3 py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">加载详情...</span>
            </div>
          ) : detail ? (
            <>
              {/* Stats 概览 */}
              <div className="bg-white border border-border rounded-lg p-4">
                <div className="text-sm font-semibold mb-2">实验: {detail.stats.experiment_id}</div>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">Control 样本</div>
                    <div className="text-lg font-semibold mt-0.5">{detail.stats.control_scores.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Variant 样本</div>
                    <div className="text-lg font-semibold mt-0.5">{detail.stats.variant_scores.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Control 均分</div>
                    <div className="text-lg font-semibold mt-0.5">
                      {detail.stats.control_scores.length > 0
                        ? (detail.stats.control_scores.reduce((a, b) => a + b, 0) / detail.stats.control_scores.length).toFixed(3)
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Variant 均分</div>
                    <div className="text-lg font-semibold mt-0.5">
                      {detail.stats.variant_scores.length > 0
                        ? (detail.stats.variant_scores.reduce((a, b) => a + b, 0) / detail.stats.variant_scores.length).toFixed(3)
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 优化建议 */}
              {detail.suggestion && (
                <div className={`border rounded-lg p-4 ${SUGGESTION_BADGE[detail.suggestion.type].color}`}>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const Icon = SUGGESTION_BADGE[detail.suggestion.type].icon;
                      return <Icon className="w-4 h-4" />;
                    })()}
                    <div className="font-semibold text-sm">
                      建议: {SUGGESTION_BADGE[detail.suggestion.type].label}
                    </div>
                    <span className="ml-auto text-xs">置信度 {(detail.suggestion.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-xs mt-1.5 opacity-90">{detail.suggestion.rationale}</div>
                  <div className="text-[10px] mt-1 opacity-70">
                    auto_apply: false (强制人工确认)
                  </div>
                </div>
              )}

              {/* HITL 操作区 */}
              <div className="bg-white border border-border rounded-lg p-4 space-y-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  人工操作 (HITL)
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">审批人</label>
                  <input
                    type="text"
                    value={approvedBy}
                    onChange={e => setApprovedBy(e.target.value)}
                    placeholder="例如: zhang.san"
                    className="w-full px-2.5 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex gap-2">
                  {detail.suggestion && (
                    <button
                      onClick={() => applySuggestion(detail.suggestion!)}
                      disabled={!approvedBy}
                      className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
                    >
                      应用建议 ({SUGGESTION_BADGE[detail.suggestion.type].label})
                    </button>
                  )}
                  <button
                    onClick={forceRollback}
                    disabled={!approvedBy}
                    className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    强制回滚
                  </button>
                </div>
                {actionMessage && (
                  <div className="text-xs bg-muted/30 px-2.5 py-2 rounded font-mono whitespace-pre-wrap">
                    {actionMessage}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

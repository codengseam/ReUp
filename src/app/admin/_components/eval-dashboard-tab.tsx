// src/app/admin/_components/eval-dashboard-tab.tsx
// M2: 评估看板 (3 个核心视图)
// - 模型对比 (RAGAS 平均分 + 成本)
// - Top Failed Queries (20)
// - Daily Trend (30 天)

'use client';
import React, { useEffect, useState } from 'react';
import {
  BarChart3, AlertTriangle, TrendingDown, Cpu, Clock, DollarSign,
  RefreshCcw, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';

interface EvalData {
  model_comparison: Array<{
    model_id: string;
    prompt_version: string | null;
    request_count: number;
    avg_score: number | null;
    avg_faithfulness: number | null;
    avg_answer_relevancy: number | null;
    avg_context_relevancy: number | null;
    total_tokens: number | null;
    total_cost: number | null;
    empty_recall_count: number | null;
  }>;
  top_failed: Array<{
    query: string;
    answer: string;
    model_id: string;
    prompt_version: string | null;
    has_recall: number;
    overall_score: number;
    faithfulness_score: number | null;
    answer_relevancy_score: number | null;
    context_relevancy_score: number | null;
    faithfulness_reason: string | null;
    created_at: number;
  }>;
  daily_trend: Array<{
    date: string;
    requests: number;
    avg_score: number | null;
    avg_latency_ms: number | null;
    empty_recall_count: number;
    error_count: number;
  }>;
  queue_stats: Array<{ status: string; c: number }>;
  summary: {
    total_requests: number;
    empty_recall_rate: number;
    total_cost: number;
    total_tokens: number;
    avg_latency_ms: number;
    error_count: number;
    error_rate: number;
    thumbs_down_rate: number;
  };
  generated_at: number;
}

const SCORE_COLOR = (s: number | null) => {
  if (s == null) return 'text-muted-foreground';
  if (s >= 0.8) return 'text-green-600';
  if (s >= 0.6) return 'text-amber-600';
  return 'text-red-600';
};

const SUMMARY_COLOR = (color: 'default' | 'red') => {
  return color === 'red' ? 'text-red-600' : 'text-foreground';
};

function SummaryCard({
  icon,
  label,
  value,
  color = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: 'default' | 'red';
}) {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-semibold mt-1 ${SUMMARY_COLOR(color)}`}>{value}</div>
    </div>
  );
}

export default function EvalDashboardTab() {
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/eval');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EvalData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">加载评估数据...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
        {error}
        <button onClick={load} className="ml-2 underline">重试</button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">评估看板</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            RAGAS 指标 (faithfulness / answer_relevancy / context_relevancy) + 队列状态
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          刷新
        </button>
      </div>

      {/* 队列状态 */}
      <div className="grid grid-cols-4 gap-3">
        {(['pending', 'running', 'done', 'failed'] as const).map(status => {
          const count = data.queue_stats.find(q => q.status === status)?.c ?? 0;
          return (
            <div key={status} className="bg-white border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground">{status}</div>
              <div className="text-2xl font-semibold mt-1">{count}</div>
            </div>
          );
        })}
      </div>

      {/* 视图 1: 模型对比 */}
      <section>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4" />
          模型对比 (按 RAGAS 综合分)
        </h3>
        {data.model_comparison.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-muted/30 px-3 py-6 rounded-lg text-center">
            暂无评估数据 — 等待 worker 处理完第一批请求
          </div>
        ) : (
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Model</th>
                  <th className="text-left px-3 py-2">Prompt Ver</th>
                  <th className="text-right px-3 py-2">请求数</th>
                  <th className="text-right px-3 py-2">综合分</th>
                  <th className="text-right px-3 py-2">忠实度</th>
                  <th className="text-right px-3 py-2">相关性</th>
                  <th className="text-right px-3 py-2">上下文</th>
                  <th className="text-right px-3 py-2">Tokens</th>
                  <th className="text-right px-3 py-2">成本</th>
                  <th className="text-right px-3 py-2">空召回</th>
                </tr>
              </thead>
              <tbody>
                {data.model_comparison.map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono text-xs">{row.model_id || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.prompt_version || '—'}</td>
                    <td className="px-3 py-2 text-right">{row.request_count}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${SCORE_COLOR(row.avg_score)}`}>
                      {row.avg_score?.toFixed(3) ?? '—'}
                    </td>
                    <td className={`px-3 py-2 text-right ${SCORE_COLOR(row.avg_faithfulness)}`}>
                      {row.avg_faithfulness?.toFixed(3) ?? '—'}
                    </td>
                    <td className={`px-3 py-2 text-right ${SCORE_COLOR(row.avg_answer_relevancy)}`}>
                      {row.avg_answer_relevancy?.toFixed(3) ?? '—'}
                    </td>
                    <td className={`px-3 py-2 text-right ${SCORE_COLOR(row.avg_context_relevancy)}`}>
                      {row.avg_context_relevancy?.toFixed(3) ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {(row.total_tokens ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      ¥{(row.total_cost ?? 0).toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.empty_recall_count && row.empty_recall_count > 0 ? (
                        <span className="text-red-600">{row.empty_recall_count}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 视图 2: Top Failed */}
      <section>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Top Failed Queries (分数最低 20)
        </h3>
        {data.top_failed.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-muted/30 px-3 py-6 rounded-lg text-center">
            暂无 bad case
          </div>
        ) : (
          <div className="bg-white border border-border rounded-lg divide-y divide-border/50">
            {data.top_failed.map((row, i) => (
              <div key={i} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{row.query}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {row.model_id} · {new Date(row.created_at * 1000).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-lg font-semibold ${SCORE_COLOR(row.overall_score)}`}>
                      {row.overall_score.toFixed(3)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">overall</div>
                  </div>
                  <button
                    onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {expandedIdx === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
                {expandedIdx === i && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2 text-xs">
                    <div>
                      <div className="text-muted-foreground mb-1">LLM 回答:</div>
                      <div className="bg-muted/30 px-2 py-1.5 rounded">{row.answer}</div>
                    </div>
                    {row.faithfulness_reason && (
                      <div>
                        <div className="text-muted-foreground mb-1">Faithfulness 拆分:</div>
                        <pre className="bg-muted/30 px-2 py-1.5 rounded whitespace-pre-wrap text-[11px]">
{row.faithfulness_reason}
                        </pre>
                      </div>
                    )}
                    <div className="flex gap-3 text-muted-foreground">
                      <span>faithfulness: <b className={SCORE_COLOR(row.faithfulness_score)}>{row.faithfulness_score?.toFixed(2) ?? '—'}</b></span>
                      <span>answer_relevancy: <b className={SCORE_COLOR(row.answer_relevancy_score)}>{row.answer_relevancy_score?.toFixed(2) ?? '—'}</b></span>
                      <span>context_relevancy: <b className={SCORE_COLOR(row.context_relevancy_score)}>{row.context_relevancy_score?.toFixed(2) ?? '—'}</b></span>
                      {row.has_recall === 0 && <span className="text-red-600">⚠️ 空召回</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 视图 3: Daily Trend */}
      <section>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <TrendingDown className="w-4 h-4" />
          30 天每日趋势
        </h3>
        {data.daily_trend.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-muted/30 px-3 py-6 rounded-lg text-center">
            暂无数据
          </div>
        ) : (
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">日期</th>
                  <th className="text-right px-3 py-2">请求数</th>
                  <th className="text-right px-3 py-2">综合分</th>
                  <th className="text-right px-3 py-2">平均延迟 (ms)</th>
                  <th className="text-right px-3 py-2">空召回</th>
                  <th className="text-right px-3 py-2">错误</th>
                </tr>
              </thead>
              <tbody>
                {data.daily_trend.map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                    <td className="px-3 py-2 text-right">{row.requests}</td>
                    <td className={`px-3 py-2 text-right ${SCORE_COLOR(row.avg_score)}`}>
                      {row.avg_score?.toFixed(3) ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {row.avg_latency_ms ? Math.round(row.avg_latency_ms) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.empty_recall_count > 0 ? (
                        <span className="text-red-600">{row.empty_recall_count}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.error_count > 0 ? (
                        <span className="text-red-600">{row.error_count}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

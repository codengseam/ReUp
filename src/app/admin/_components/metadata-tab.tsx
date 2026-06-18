'use client';
// src/app/admin/_components/metadata-tab.tsx
// ReUp v2 Phase 2E: 分类浏览 tab（基于 L2 细分类 + book×category 交叉表）。
//
// 设计要点（参考 docs/superpowers/specs/2026-06-15-knowledge-metadata-restructure-design.md §3.5）：
//   - 顶部 4 张统计卡：晋升 / 面试 / 通用 / 总计
//   - 两个视图：按分类（细粒度） / 按书 × 分类（交叉表）
//   - 数据来源：/api/admin/knowledge?action=stats & ?action=topic-summary & ?action=by-category
//   - 移除原"按 Skill 维度"（已拆出到 framework-skills tab）

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, RefreshCw, FolderTree, BookOpen, Layers, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TabKey, KnowledgeFilter } from '../_lib/types';

const KNOWLEDGE_API = '/api/admin/knowledge';

/** 与 admin-knowledge.getKnowledgeStats() 返回结构对齐的最小子集。 */
interface StatsSummary {
  total: number;
  byBook: Array<{ name: string; count: number }>;
  byCategory: Array<{ name: string; count: number }>;
}

/** 与 admin-knowledge.listByGroup() 单个 group 的形状对齐。 */
interface CategoryGroup {
  name: string;
  count: number;
  sample: { preview: string; book: string; sectionTitle: string };
}

/** 与 admin-knowledge.getTopicSummary() 返回结构对齐。 */
interface TopicSummary {
  byBookCategory: Array<{
    book: string;
    categories: Array<{ category: string; count: number }>;
  }>;
  byBook: Array<{ name: string; total: number }>;
  byCategory: Array<{ name: string; total: number }>;
  genericCount: number;
}

/** 视图切换 key。 */
type ViewKey = 'category' | 'crosstab';

const VIEW_TABS: Array<{ key: ViewKey; label: string; icon: React.ElementType }> = [
  { key: 'category', label: '按分类', icon: FolderTree },
  { key: 'crosstab', label: '按书 × 分类', icon: Layers },
];

/** 兜底分类（派生规则未命中时填入的值）。 */
const GENERIC_CATEGORY = '通用';

/** 用作 4 张统计卡图标的预设颜色 token（沿用 knowledge-tab 的视觉风格）。 */
const ICON_BG: Record<string, string> = {
  promotion: 'bg-emerald-50',
  interview: 'bg-blue-50',
  generic: 'bg-amber-50',
  total: 'bg-purple-50',
};
const ICON_FG: Record<string, string> = {
  promotion: 'text-emerald-600',
  interview: 'text-blue-600',
  generic: 'text-amber-600',
  total: 'text-purple-600',
};

interface MetadataTabProps {
  onNavigate?: (tab: TabKey, filter?: KnowledgeFilter) => void;
}

export default function MetadataTab({ onNavigate }: MetadataTabProps = {}) {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [topicSummary, setTopicSummary] = useState<TopicSummary | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKey>('category');

  /** 拉取 3 路数据：stats / topic-summary / by-category groups。 */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, summaryRes, catRes] = await Promise.all([
        fetch(`${KNOWLEDGE_API}?action=stats`),
        fetch(`${KNOWLEDGE_API}?action=topic-summary`),
        fetch(`${KNOWLEDGE_API}?action=by-category`),
      ]);

      if (!statsRes.ok) {
        const body = await statsRes.json().catch(() => ({}));
        throw new Error(body.error || '获取统计失败');
      }
      if (!summaryRes.ok) {
        const body = await summaryRes.json().catch(() => ({}));
        throw new Error(body.error || '获取主题摘要失败');
      }
      if (!catRes.ok) {
        const body = await catRes.json().catch(() => ({}));
        throw new Error(body.error || '获取分类失败');
      }

      const [statsData, summaryData, catData] = await Promise.all([
        statsRes.json(),
        summaryRes.json(),
        catRes.json(),
      ]);

      setStats({
        total: statsData.total ?? 0,
        byBook: statsData.byBook ?? [],
        byCategory: statsData.byCategory ?? [],
      });
      setTopicSummary({
        byBookCategory: summaryData.byBookCategory ?? [],
        byBook: summaryData.byBook ?? [],
        byCategory: summaryData.byCategory ?? [],
        genericCount: summaryData.genericCount ?? 0,
      });
      setCategories(catData.groups ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载分类数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** 按书名查 chunk 数（不区分大小写），用于"晋升/面试"卡片。 */
  const countForBook = (bookName: string): number => {
    if (!stats) return 0;
    const hit = stats.byBook.find((b) => b.name === bookName);
    return hit?.count ?? 0;
  };

  const promotionCount = countForBook('大厂晋升指南');
  const interviewCount = countForBook('面试现场');
  const genericCount = topicSummary?.genericCount ?? 0;
  const totalCount = stats?.total ?? 0;

  /** 4 张统计卡（按 spec §3.5：晋升 / 面试 / 通用 / 总计）。 */
  const statCards: Array<{
    key: string;
    label: string;
    value: number;
    icon: React.ElementType;
    colorKey: keyof typeof ICON_BG;
    hint?: string;
    muted?: boolean;
  }> = [
    {
      key: 'promotion',
      label: '晋升类',
      value: promotionCount,
      icon: BookOpen,
      colorKey: 'promotion',
      hint: '大厂晋升指南',
    },
    {
      key: 'interview',
      label: '面试类',
      value: interviewCount,
      icon: BookOpen,
      colorKey: 'interview',
      hint: '面试现场',
    },
    {
      key: 'generic',
      label: '通用',
      value: genericCount,
      icon: FolderTree,
      colorKey: 'generic',
      hint: '派生规则未命中',
      muted: true,
    },
    {
      key: 'total',
      label: '总计',
      value: totalCount,
      icon: BarChart3,
      colorKey: 'total',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 顶部：标题 + 刷新 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">分类浏览</h2>
          <p className="text-sm text-muted-foreground mt-1">
            L2 细分类（基于 title_path 关键词规则派生），共 {loading ? '…' : totalCount} 个 chunk
          </p>
        </div>
        <Button
          onClick={fetchAll}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          刷新
        </Button>
      </div>

      {/* 4 张统计卡 */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card
              key={c.key}
              className={c.muted ? 'bg-muted/30 border-dashed' : undefined}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${ICON_BG[c.colorKey]} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${ICON_FG[c.colorKey]}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {c.label}
                      {c.hint && <span className="ml-1 text-muted-foreground/70">· {c.hint}</span>}
                    </p>
                    <p
                      data-testid={`stat-${c.key}`}
                      className={`text-2xl font-bold ${c.muted ? 'text-muted-foreground' : 'text-foreground'}`}
                    >
                      {loading ? '-' : c.value}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 视图切换 + 视图本体 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>分类分布</CardTitle>
            <div className="flex gap-1 border border-border rounded-lg p-0.5">
              {VIEW_TABS.map((v) => {
                const Icon = v.icon;
                const isActive = view === v.key;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setView(v.key)}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t border-border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                加载分类数据...
              </div>
            ) : view === 'category' ? (
              <CategoryView groups={categories} onNavigate={onNavigate} />
            ) : (
              <CrosstabView summary={topicSummary} onNavigate={onNavigate} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- 子视图 ----------------

interface CategoryViewProps {
  groups: CategoryGroup[];
  onNavigate?: (tab: TabKey, filter?: KnowledgeFilter) => void;
}

/** 按分类细粒度视图：分类名 + chunk 数 + 1 条 sample preview。 */
function CategoryView({ groups, onNavigate }: CategoryViewProps) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">暂无分类数据</p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/20">
          <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">分类</th>
          <th className="text-right px-5 py-3 font-medium text-muted-foreground text-xs w-24">Chunk 数</th>
          <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">示例</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const isGeneric = g.name === GENERIC_CATEGORY;
          return (
            <tr
              key={g.name || '(空)'}
              data-testid={`category-row-${g.name || 'empty'}`}
              onClick={() => onNavigate?.('knowledge', { group: 'category', name: g.name })}
              className={`border-b border-border/50 cursor-pointer ${isGeneric ? 'bg-muted/20 text-muted-foreground hover:bg-muted/30' : 'hover:bg-muted/10'}`}
            >
              <td className="px-5 py-3 font-mono text-xs">
                <span className={isGeneric ? 'text-muted-foreground' : 'text-foreground'}>
                  {g.name || '(空)'}
                </span>
                {isGeneric && (
                  <span className="ml-2 text-[10px] text-muted-foreground/70">兜底</span>
                )}
              </td>
              <td className="px-5 py-3 text-right text-sm font-semibold">
                {g.count}
              </td>
              <td className="px-5 py-3 text-xs text-muted-foreground truncate max-w-[480px]">
                {g.sample?.preview || '-'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface CrosstabViewProps {
  summary: TopicSummary | null;
  onNavigate?: (tab: TabKey, filter?: KnowledgeFilter) => void;
}

/** 按书 × 分类交叉表视图：每个 book 一行展开，所有 category 平铺列出。 */
function CrosstabView({ summary, onNavigate }: CrosstabViewProps) {
  if (!summary || summary.byBookCategory.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">暂无交叉表数据</p>
    );
  }
  return (
    <div className="divide-y divide-border">
      {summary.byBookCategory.map((row) => {
        const total = row.categories.reduce((s, c) => s + c.count, 0);
        return (
          <div key={row.book} className="px-5 py-4" data-testid={`crosstab-book-${row.book}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono text-xs font-semibold text-foreground">
                  {row.book}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">合计 {total} 个 chunk</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {row.categories.map((c) => {
                const isGeneric = c.category === GENERIC_CATEGORY;
                return (
                  <div
                    key={c.category}
                    data-testid={`crosstab-cell-${row.book}-${c.category}`}
                    onClick={() => onNavigate?.('knowledge', { group: 'category', name: c.category, book: row.book })}
                    className={`rounded-lg border px-3 py-2 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all ${
                      isGeneric
                        ? 'border-dashed border-border bg-muted/30 text-muted-foreground'
                        : 'border-border bg-white'
                    }`}
                  >
                    <p className={`text-[11px] ${isGeneric ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                      {c.category}
                      {isGeneric && <span className="ml-1 text-muted-foreground/70">（兜底）</span>}
                    </p>
                    <p className={`text-lg font-bold ${isGeneric ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {c.count}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database, RefreshCw, Search, BookOpen, FolderTree, Sparkles,
  Loader2, FileText, ChevronDown, ChevronRight, BookText, Heading2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const KNOWLEDGE_API = '/api/admin/knowledge';
interface KnowledgeStats {
  total: number;
  dimension: number;
  byBook: Array<{ name: string; count: number }>;
  byCategory: Array<{ name: string; count: number }>;
  bySkill: Array<{ name: string; count: number }>;
  byChapter: Array<{ name: string; count: number }>;
  bySection: Array<{ name: string; count: number }>;
}

interface ChunkHit {
  id: string;
  preview: string;
  book: string;
  category: string;
  skillName: string;
  /** L3 节级一句话主题（来自 metadata.topic，Phase 2A 注入）。 */
  topic: string;
  sourcePath: string;
  docTitle: string;
  sectionTitle: string;
  chunkIndex: number;
}

/** 知识库 tab 的分组维度。Phase 2F 改为 4 维度：
 * - book         ：按书（2 本）
 * - category     ：按 L2 细分类（19 业务类 + 通用）
 * - docTitle     ：按章（doc_title，章级）
 * - sectionTitle ：按节（section_title，节级）
 * 框架 Skill 已拆出到 framework-skills tab（Phase 2D），本 tab 不再展示。
 */
type GroupTab = 'book' | 'category' | 'docTitle' | 'sectionTitle';

const GROUP_TABS: Array<{ key: GroupTab; label: string; icon: React.ElementType }> = [
  { key: 'book', label: '按书', icon: BookOpen },
  { key: 'category', label: '按分类', icon: FolderTree },
  { key: 'docTitle', label: '按章', icon: BookText },
  { key: 'sectionTitle', label: '按节', icon: Heading2 },
];

/** 把 stats 归一化为当前 active tab 所需的 group 列表（4 维度分支）。 */
function pickGroups(stats: KnowledgeStats | null, key: GroupTab): Array<{ name: string; count: number }> {
  if (!stats) return [];
  switch (key) {
    case 'book': return stats.byBook;
    case 'category': return stats.byCategory;
    case 'docTitle': return stats.byChapter ?? [];
    case 'sectionTitle': return stats.bySection ?? [];
  }
}

export default function KnowledgeTab() {
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [reloadedAt, setReloadedAt] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<ChunkHit[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  // 默认按章（docTitle）：多数场景下 chunk 数量落在 50 个左右，最适合浏览
  const [activeGroup, setActiveGroup] = useState<GroupTab>('docTitle');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [groupChunks, setGroupChunks] = useState<ChunkHit[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);

  // 加载 stats
  const fetchStats = useCallback(async (withToast = false) => {
    setLoadingStats(true);
    try {
      const res = await fetch(`${KNOWLEDGE_API}?action=stats`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取知识库统计失败');
      setStats(data);
      if (withToast) toast.success('vectors.json 已重新加载');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '获取知识库统计失败');
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 重新加载 vectors.json
  const handleReload = async () => {
    setReloading(true);
    try {
      const res = await fetch(`${KNOWLEDGE_API}?action=reload`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '重新加载失败');
      setReloadedAt(data.reloadedAt);
      await fetchStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重新加载失败');
    } finally {
      setReloading(false);
    }
  };

  // 搜索
  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) {
      setHits([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    setHasSearched(true);
    try {
      const res = await fetch(
        `${KNOWLEDGE_API}?action=search&q=${encodeURIComponent(q)}&limit=20`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '搜索失败');
      setHits(data.results ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '搜索失败');
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  // 展开某分组：搜索该 group name 作为 query（与旧实现保持一致）
  const handleToggleGroup = useCallback(
    async (key: string) => {
      if (expandedKey === key) {
        setExpandedKey(null);
        setGroupChunks([]);
        return;
      }
      setExpandedKey(key);
      setLoadingGroup(true);
      setGroupChunks([]);
      try {
        const res = await fetch(
          `${KNOWLEDGE_API}?action=search&q=${encodeURIComponent(key)}&limit=10`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '加载分组 chunk 失败');
        setGroupChunks(data.results ?? []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '加载分组 chunk 失败');
      } finally {
        setLoadingGroup(false);
      }
    },
    [expandedKey]
  );

  const currentGroups = pickGroups(stats, activeGroup);

  return (
    <div className="space-y-6">
      {/* 顶部：标题 + 重新加载 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">知识库管理</h2>
          <p className="text-sm text-muted-foreground mt-1">
            本地向量知识库（基于 data/skill-vectors.json，608 个 chunk），支持搜索、统计、重新加载
          </p>
        </div>
        <Button
          onClick={handleReload}
          disabled={reloading}
          className="gap-1.5"
        >
          {reloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          重新加载 vectors.json
        </Button>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Database className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">总 Chunk 数</p>
                <p className="text-2xl font-bold text-foreground">
                  {loadingStats ? '-' : (stats?.total ?? 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <Sparkles className="w-4.5 h-4.5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">向量维度</p>
                <p className="text-2xl font-bold text-foreground">
                  {loadingStats ? '-' : (stats?.dimension ?? 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <FolderTree className="w-4.5 h-4.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">最后加载时间</p>
                <p className="text-sm font-semibold text-foreground">
                  {reloadedAt
                    ? new Date(reloadedAt).toLocaleString('zh-CN')
                    : stats
                      ? '已加载'
                      : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索 */}
      <Card>
        <CardHeader>
          <CardTitle>搜索 Chunk</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="输入关键词，如「晋升」「STAR」「项目复盘」..."
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={searching || !query.trim()} className="gap-1.5">
              {searching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              搜索
            </Button>
          </form>

          {hasSearched && (
            <div className="mt-4">
              {hits.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  没有匹配的 chunk
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    共 {hits.length} 条结果
                  </p>
                  {hits.map((h) => (
                    <div
                      key={h.id}
                      data-testid="search-hit"
                      className="border border-border rounded-lg bg-white p-3"
                    >
                      {/* 主题行：book / doc_title（mono 字体，让用户一眼看清 chunk 来自哪本书哪章） */}
                      <p
                        data-testid="search-hit-topic"
                        className="text-[11px] font-mono text-muted-foreground mb-1"
                      >
                        {h.book || '(未知书)'}
                        <span className="mx-1.5 opacity-50">/</span>
                        {h.docTitle || '(未知章)'}
                      </p>
                      {/* topic 副标题：节级一句话（来自 metadata.topic） */}
                      {h.topic && (
                        <p
                          data-testid="search-hit-subtitle"
                          className="text-xs font-medium text-foreground mb-2"
                        >
                          {h.topic}
                        </p>
                      )}
                      <p className="text-xs text-foreground leading-relaxed mb-2">
                        {h.preview}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {h.category && <Badge variant="secondary">{h.category}</Badge>}
                        {h.sectionTitle && (
                          <span className="text-foreground">· {h.sectionTitle}</span>
                        )}
                        {typeof h.chunkIndex === 'number' && (
                          <span className="font-mono ml-auto">chunk #{h.chunkIndex}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 分组分布 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Chunk 分布</CardTitle>
            <div className="flex gap-1 border border-border rounded-lg p-0.5">
              {GROUP_TABS.map((g) => {
                const Icon = g.icon;
                const isActive = activeGroup === g.key;
                return (
                  <button
                    key={g.key}
                    data-testid={`group-tab-${g.key}`}
                    onClick={() => { setActiveGroup(g.key); setExpandedKey(null); }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t border-border">
            {currentGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {loadingStats ? '加载中...' : '暂无数据'}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="w-10" />
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">
                      名称
                    </th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground text-xs">
                      Chunk 数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentGroups.map((g) => {
                    const isOpen = expandedKey === g.name;
                    return (
                      <React.Fragment key={g.name || '(empty)'}>
                        <tr
                          className="border-b border-border/50 hover:bg-muted/20 cursor-pointer"
                          onClick={() => handleToggleGroup(g.name)}
                        >
                          <td className="px-3 py-3 text-muted-foreground">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-foreground">
                            {g.name || '(空)'}
                          </td>
                          <td className="px-5 py-3 text-right text-sm font-semibold">
                            {g.count}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-muted/10">
                            <td colSpan={3} className="px-5 py-4">
                              {loadingGroup ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  加载 chunk 列表...
                                </div>
                              ) : groupChunks.length === 0 ? (
                                <p className="text-xs text-muted-foreground">未找到匹配的 chunk</p>
                              ) : (
                                <div className="space-y-2">
                                  {groupChunks.map((c) => (
                                    <div
                                      key={c.id}
                                      className="border border-border rounded-lg bg-white p-3"
                                    >
                                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
                                        <FileText className="w-3 h-3" />
                                        {c.docTitle || c.sourcePath}
                                        {c.sectionTitle && (
                                          <span className="text-foreground">· {c.sectionTitle}</span>
                                        )}
                                        {typeof c.chunkIndex === 'number' && (
                                          <span className="font-mono ml-auto">chunk #{c.chunkIndex}</span>
                                        )}
                                      </div>
                                      <p className="text-xs text-foreground leading-relaxed">
                                        {c.preview}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

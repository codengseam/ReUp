'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database, RefreshCw, Search, BookOpen, FolderTree, Sparkles,
  Loader2, FileText, ChevronDown, ChevronRight, BookText, Heading2,
  Eye, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

/** Full text of a chunk (returned by action=chunk-full-text). */
interface ChunkFullText {
  id: string;
  text: string;
  book: string;
  category: string;
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
  const groupToggleAbortRef = useRef<AbortController | null>(null);
  const groupToggleReqIdRef = useRef(0);

  // Full-text detail view
  const [fullTextChunk, setFullTextChunk] = useState<ChunkFullText | null>(null);
  const [loadingFullText, setLoadingFullText] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const fullTextAbortRef = useRef<AbortController | null>(null);
  const fullTextReqIdRef = useRef(0);

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

  // 展开某分组：使用 by-* 专有端点按分组 key 过滤，避免全文搜索。
  const handleToggleGroup = useCallback(
    async (key: string) => {
      if (expandedKey === key) {
        setExpandedKey(null);
        setGroupChunks([]);
        return;
      }
      // Abort previous in-flight request
      groupToggleAbortRef.current?.abort();
      const controller = new AbortController();
      groupToggleAbortRef.current = controller;
      const reqId = ++groupToggleReqIdRef.current;

      setExpandedKey(key);
      setLoadingGroup(true);
      setGroupChunks([]);
      try {
        // Map the active GroupTab to the corresponding API action
        const actionMap: Record<GroupTab, string> = {
          book: 'by-book',
          category: 'by-category',
          skillName: 'by-skill',
          docTitle: 'by-chapter',
          sectionTitle: 'by-section',
          topic: 'by-topic',
        };
        const action = actionMap[activeGroup] ?? 'by-chapter';
        const res = await fetch(
          `${KNOWLEDGE_API}?action=${action}&limit=10`,
          { signal: controller.signal }
        );
        if (reqId !== groupToggleReqIdRef.current) return;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '加载分组 chunk 失败');
        // Filter to the specific group by name client-side
        const allGroups = (data.groups ?? []) as Array<{ name: string; chunks: ChunkHit[] }>;
        const matched = allGroups.find((g) => g.name === key);
        if (reqId !== groupToggleReqIdRef.current) return;
        setGroupChunks(matched?.chunks ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (reqId !== groupToggleReqIdRef.current) return;
        toast.error(err instanceof Error ? err.message : '加载分组 chunk 失败');
      } finally {
        if (reqId === groupToggleReqIdRef.current) {
          setLoadingGroup(false);
        }
      }
    },
    [expandedKey, activeGroup]
  );

  // 查看分段全文详情
  const handleViewFullText = useCallback(async (chunkId: string) => {
    // Abort any in-flight request
    fullTextAbortRef.current?.abort();
    const controller = new AbortController();
    fullTextAbortRef.current = controller;
    const reqId = ++fullTextReqIdRef.current;

    setLoadingFullText(true);
    setDetailOpen(true);
    setFullTextChunk(null);
    try {
      const res = await fetch(
        `${KNOWLEDGE_API}?action=chunk-full-text&id=${encodeURIComponent(chunkId)}`,
        { signal: controller.signal }
      );
      if (reqId !== fullTextReqIdRef.current) return; // stale request
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '加载全文失败');
      }
      const data = (await res.json()) as ChunkFullText;
      if (reqId !== fullTextReqIdRef.current) return;
      setFullTextChunk(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (reqId !== fullTextReqIdRef.current) return;
      toast.error(err instanceof Error ? err.message : '加载全文失败');
      setDetailOpen(false);
    } finally {
      if (reqId === fullTextReqIdRef.current) {
        setLoadingFullText(false);
      }
    }
  }, []);

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
                                      className="border border-border rounded-lg bg-white p-3 group"
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
                                      <p className="text-xs text-foreground leading-relaxed mb-2">
                                        {c.preview}
                                      </p>
                                      <div className="flex justify-end">
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/5 rounded transition-colors opacity-0 group-hover:opacity-100"
                                          onClick={(e) => { e.stopPropagation(); void handleViewFullText(c.id); }}
                                        >
                                          <Eye className="w-3 h-3" />
                                          查看全文
                                        </button>
                                      </div>
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

      {/* 全文详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" />
              {fullTextChunk ? (
                <span>
                  {fullTextChunk.docTitle}
                  {fullTextChunk.sectionTitle && ` · ${fullTextChunk.sectionTitle}`}
                  {typeof fullTextChunk.chunkIndex === 'number' && (
                    <span className="font-mono text-muted-foreground ml-1">
                      chunk #{fullTextChunk.chunkIndex}
                    </span>
                  )}
                </span>
              ) : (
                '加载中...'
              )}
            </DialogTitle>
          </DialogHeader>
          {loadingFullText ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : fullTextChunk ? (
            <pre className="text-xs leading-relaxed whitespace-pre-wrap text-foreground bg-muted/30 p-4 rounded-lg">
              {fullTextChunk.text}
            </pre>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

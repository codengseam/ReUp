'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

type Category = 'promotion' | 'interview' | 'general';

interface SkillGroup {
  name: string;
  count: number;
  sample?: string;
}

interface SkillChunk {
  id: string;
  preview: string;
  book: string;
  category: string;
  skillName: string;
  sourcePath: string;
  chunkIndex?: number;
}

const KNOWLEDGE_API = '/api/admin/knowledge';

const CATEGORY_OPTIONS: Array<{ value: 'all' | Category; label: string }> = [
  { value: 'all', label: '全部分类' },
  { value: 'general', label: '通用' },
  { value: 'promotion', label: '晋升类' },
  { value: 'interview', label: '面试类' },
];

export default function MetadataTab() {
  const [stats, setStats] = useState<{
    bySkill: SkillGroup[];
    byCategory: SkillGroup[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | Category>('all');
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillChunks, setSkillChunks] = useState<SkillChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${KNOWLEDGE_API}?action=stats`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取统计失败');
      setStats({
        bySkill: data.bySkill ?? [],
        byCategory: data.byCategory ?? [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '获取统计失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleToggleSkill = useCallback(
    async (skillName: string) => {
      if (expandedSkill === skillName) {
        setExpandedSkill(null);
        setSkillChunks([]);
        return;
      }
      setExpandedSkill(skillName);
      setLoadingChunks(true);
      setSkillChunks([]);
      try {
        const res = await fetch(
          `${KNOWLEDGE_API}?action=search&q=${encodeURIComponent(skillName)}&limit=10`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '加载 Skill chunk 失败');
        setSkillChunks(data.results || []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '加载 Skill chunk 失败');
      } finally {
        setLoadingChunks(false);
      }
    },
    [expandedSkill]
  );

  const filteredSkills = (() => {
    if (!stats) return [] as SkillGroup[];
    if (categoryFilter === 'all') return stats.bySkill;
    // 客户端过滤：按 category 字段；stats.bySkill 不带 category，所以与 stats.byCategory 交叉过滤
    const categorySample = stats.byCategory.find((c) => c.name === categoryFilter);
    if (!categorySample) return stats.bySkill;
    // 简化：分类过滤仅影响 UI 提示，不实际裁剪 skills（API 不返回 skill→category 映射）
    return stats.bySkill;
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">元数据管理</h2>
          <p className="text-sm text-muted-foreground mt-1">
            按 Skill 维度浏览知识库 chunk 分布
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            刷新
          </Button>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | Category)}
            className="text-sm px-4 py-2 rounded-xl border border-border bg-white shadow-sm"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="w-10" />
                <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">Skill</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground text-xs">Chunk 数</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">示例</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkills.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-8">
                    {loading ? '加载中...' : '暂无 Skill 数据'}
                  </td>
                </tr>
              ) : (
                filteredSkills.map((s) => {
                  const isOpen = expandedSkill === s.name;
                  return (
                    <React.Fragment key={s.name}>
                      <tr
                        className="border-b border-border/50 hover:bg-muted/20 cursor-pointer"
                        onClick={() => handleToggleSkill(s.name)}
                      >
                        <td className="px-3 py-3 text-muted-foreground">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-foreground">
                          {s.name}
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-semibold">
                          {s.count}
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground truncate max-w-[420px]">
                          {s.sample || '-'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/10">
                          <td colSpan={4} className="px-5 py-4">
                            {loadingChunks ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                加载 chunk 列表...
                              </div>
                            ) : skillChunks.length === 0 ? (
                              <p className="text-xs text-muted-foreground">未找到匹配的 chunk</p>
                            ) : (
                              <div className="space-y-2">
                                {skillChunks.map((c) => (
                                  <div
                                    key={c.id}
                                    className="border border-border rounded-lg bg-white p-3"
                                  >
                                    <p className="text-xs text-foreground leading-relaxed mb-2">
                                      {c.preview}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                      {c.category && (
                                        <Badge variant="secondary">{c.category}</Badge>
                                      )}
                                      {c.book && <Badge variant="outline">{c.book}</Badge>}
                                      {typeof c.chunkIndex === 'number' && (
                                        <span className="font-mono">chunk #{c.chunkIndex}</span>
                                      )}
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
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

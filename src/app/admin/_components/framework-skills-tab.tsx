'use client';

/**
 * FrameworkSkillsTab — admin 后台 L1 框架 Skill 浏览器
 *
 * 展示 8 个对话层 Skill（晋升 4 + 面试 4），按分类分两列卡片渲染。
 * 点击卡片展开 SKILL.md 完整 markdown 内容。
 *
 * 数据来源：GET /api/admin/skills（由 admin-knowledge.getFrameworkSkills() 包装 skills-loader）。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, RefreshCw, Loader2, ChevronDown, ChevronRight,
  Briefcase, MessageCircle, FileText, TrendingUp, CheckCircle2, CircleAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { FrameworkSkill } from '@/server/db/admin-knowledge';

const SKILLS_API = '/api/admin/skills';

const CATEGORY_META: Record<
  FrameworkSkill['category'],
  { label: string; icon: React.ElementType; badgeClass: string; dotClass: string }
> = {
  promotion: {
    label: '晋升类',
    icon: TrendingUp,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  interview: {
    label: '面试类',
    icon: MessageCircle,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
  },
};

/** 极简 markdown 渲染（# / ## / ### / 列表 / 段落）；不引入第三方库。 */
function renderMarkdown(md: string): React.ReactNode {
  return md.split('\n').map((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) return <h3 key={idx} className="text-sm font-semibold text-foreground mt-3 mb-1">{line.slice(4)}</h3>;
    if (line.startsWith('## ')) return <h2 key={idx} className="text-base font-semibold text-foreground mt-4 mb-1.5">{line.slice(3)}</h2>;
    if (line.startsWith('# ')) return <h1 key={idx} className="text-lg font-bold text-foreground mt-4 mb-2">{line.slice(2)}</h1>;
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={idx} className="flex gap-1.5 text-xs text-foreground leading-relaxed pl-2">
          <span className="text-muted-foreground select-none">•</span>
          <span>{line.slice(2)}</span>
        </div>
      );
    }
    if (line === '') return <div key={idx} className="h-2" />;
    return <p key={idx} className="text-xs text-foreground leading-relaxed">{line}</p>;
  });
}

export default function FrameworkSkillsTab() {
  const [skills, setSkills] = useState<FrameworkSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 拉取 8 个框架 Skill 完整定义
  const fetchSkills = useCallback(async (withToast = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(SKILLS_API, { credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { skills?: FrameworkSkill[] };
      setSkills(Array.isArray(data.skills) ? data.skills : []);
      if (withToast) toast.success('已刷新 8 个框架 Skill');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载 Skill 失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => { void fetchSkills(); }, [fetchSkills]);

  const handleRefresh = () => {
    setReloading(true);
    void fetchSkills(true);
  };

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // 分类聚合
  const promotionSkills = skills.filter((s) => s.category === 'promotion');
  const interviewSkills = skills.filter((s) => s.category === 'interview');
  const loadedMdCount = skills.filter((s) => typeof s.markdown === 'string' && s.markdown.length > 0).length;
  const allMdLoaded = skills.length > 0 && loadedMdCount === skills.length;

  // 顶部 4 个统计卡
  const stats = [
    { key: 'total', label: '总 Skill 数', value: loading ? '-' : `${skills.length} 个`, icon: Sparkles, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
    { key: 'promotion', label: '晋升类', value: loading ? '-' : `${promotionSkills.length} 个`, icon: TrendingUp, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
    { key: 'interview', label: '面试类', value: loading ? '-' : `${interviewSkills.length} 个`, icon: MessageCircle, bg: 'bg-blue-50', fg: 'text-blue-600' },
    {
      key: 'md', label: 'SKILL.md 加载',
      value: loading ? '-' : `${loadedMdCount}/${skills.length}`,
      icon: allMdLoaded ? CheckCircle2 : CircleAlert,
      bg: allMdLoaded ? 'bg-emerald-50' : 'bg-amber-50',
      fg: allMdLoaded ? 'text-emerald-600' : 'text-amber-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 顶部标题 + 刷新按钮 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />Skill 框架
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            L1 对话层 Skill（注入 system prompt 指导 LLM 怎么回答），共 8 个 · 晋升 4 + 面试 4
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={reloading || loading} className="gap-1.5">
          {reloading || loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          刷新
        </Button>
      </div>

      {/* 4 个统计卡 */}
      <div className="grid grid-cols-4 gap-4" data-testid="framework-skills-stats">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.key} data-testid={`stat-${s.key}`}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center`}>
                    <Icon className={`w-4.5 h-4.5 ${s.fg}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold text-foreground font-mono">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 错误提示 */}
      {error && !loading && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-lg px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 两个分类分区 */}
      <div className="grid grid-cols-2 gap-5">
        <CategoryColumn
          categoryKey="promotion"
          items={promotionSkills}
          loading={loading}
          expandedId={expandedId}
          onToggle={handleToggle}
        />
        <CategoryColumn
          categoryKey="interview"
          items={interviewSkills}
          loading={loading}
          expandedId={expandedId}
          onToggle={handleToggle}
        />
      </div>
    </div>
  );
}

// ========== 内部组件 ==========

interface CategoryColumnProps {
  categoryKey: FrameworkSkill['category'];
  items: FrameworkSkill[];
  loading: boolean;
  expandedId: string | null;
  onToggle: (id: string) => void;
}

function CategoryColumn({ categoryKey, items, loading, expandedId, onToggle }: CategoryColumnProps) {
  const meta = CATEGORY_META[categoryKey];
  const Icon = meta.icon;
  return (
    <div className="space-y-3" data-testid={`column-${categoryKey}`}>
      <div className="flex items-center gap-2 px-1">
        <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
        <Icon className="w-4 h-4 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
        <Badge variant="secondary" className="font-mono">{loading ? '-' : `${items.length} 个`}</Badge>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-12 border border-dashed border-border rounded-xl">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />加载 Skill 列表...
        </div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-12 text-center border border-dashed border-border rounded-xl">
          该分类下暂无 Skill
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isOpen={expandedId === skill.id}
              onToggle={() => onToggle(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SkillCardProps {
  skill: FrameworkSkill;
  isOpen: boolean;
  onToggle: () => void;
}

function SkillCard({ skill, isOpen, onToggle }: SkillCardProps) {
  const meta = CATEGORY_META[skill.category];
  return (
    <Card
      className={`cursor-pointer transition-shadow hover:shadow-md ${isOpen ? 'ring-1 ring-primary/30' : ''}`}
      onClick={onToggle}
      data-testid={`skill-card-${skill.id}`}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h4 className="text-sm font-semibold text-foreground truncate">{skill.name}</h4>
              <Badge className={meta.badgeClass}>{meta.label}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-mono text-foreground/60">trigger:</span> {skill.trigger}
            </p>
          </div>
          {isOpen
            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
        </div>
        <div className="flex items-start gap-2 text-xs">
          <Briefcase className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-foreground leading-relaxed">{skill.framework}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">步骤</p>
          <ol className="space-y-1">
            {skill.steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-foreground leading-relaxed">
                <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono font-semibold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        {isOpen && (
          <div
            className="pt-3 border-t border-border"
            onClick={(e) => e.stopPropagation()}
            data-testid={`skill-markdown-${skill.id}`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">SKILL.md</span>
              {skill.markdownPath && (
                <span className="text-[10px] text-muted-foreground/70 font-mono truncate">
                  · {skill.markdownPath.split('/').slice(-2).join('/')}
                </span>
              )}
            </div>
            {skill.markdown ? (
              <div className="bg-muted/30 border border-border rounded-lg p-3 max-h-80 overflow-y-auto">
                {renderMarkdown(skill.markdown)}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">未能加载 SKILL.md（文件可能不存在）</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

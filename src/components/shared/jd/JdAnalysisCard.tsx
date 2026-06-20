'use client';

import { Sparkles, Lightbulb, AlertTriangle, Users, TrendingUp, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  analysis: {
    summary: string;
    keyCompetencies: string[];
    interviewQuestions: Array<{ question: string; weight: 'high' | 'medium' | 'low'; purpose: string }>;
    hiddenRisks: string[];
    cultureFit: string[];
    growthPath: string[];
  };
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      {icon}
      {label}
    </div>
  );
}

function WeightBadge({ weight }: { weight: 'high' | 'medium' | 'low' }) {
  const variant = weight === 'high' ? 'destructive' : weight === 'medium' ? 'secondary' : 'outline';
  const label = weight === 'high' ? '高' : weight === 'medium' ? '中' : '低';
  return (
    <Badge variant={variant} className="text-[9px] px-1.5 py-0 shrink-0">
      {label}
    </Badge>
  );
}

export function JdAnalysisCard({ analysis }: Props) {
  return (
    <div className="space-y-5 border-t border-border pt-5">
      <div>
        <SectionHeader icon={<Sparkles className="w-3 h-3" />} label="岗位专家解读" />
        <p className="text-[12px] text-foreground leading-relaxed bg-primary-container/30 rounded-lg px-3 py-2.5">
          {analysis.summary}
        </p>
      </div>

      {analysis.keyCompetencies.length > 0 && (
        <div>
          <SectionHeader icon={<Lightbulb className="w-3 h-3" />} label="核心能力要求" />
          <div className="flex flex-wrap gap-1.5">
            {analysis.keyCompetencies.map((c, idx) => (
              <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md bg-muted/50 border border-border text-[11px] text-foreground">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.interviewQuestions.length > 0 && (
        <div>
          <SectionHeader icon={<HelpCircle className="w-3 h-3" />} label="可能的面试问题" />
          <div className="space-y-2">
            {analysis.interviewQuestions.map((q, idx) => (
              <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-border bg-muted/20">
                <WeightBadge weight={q.weight} />
                <div className="min-w-0">
                  <p className="text-[11px] text-foreground leading-relaxed">{q.question}</p>
                  {q.purpose && <p className="text-[10px] text-muted-foreground mt-0.5">{q.purpose}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.hiddenRisks.length > 0 && (
        <div>
          <SectionHeader icon={<AlertTriangle className="w-3 h-3" />} label="隐藏风险与注意点" />
          <ul className="space-y-1">
            {analysis.hiddenRisks.map((r, idx) => (
              <li key={idx} className="text-[11px] text-foreground leading-relaxed pl-3 relative before:content-[''] before:w-1 before:h-1 before:bg-amber-500 before:rounded-full before:absolute before:left-0 before:top-[7px]">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.cultureFit.length > 0 && (
        <div>
          <SectionHeader icon={<Users className="w-3 h-3" />} label="文化与团队匹配" />
          <ul className="space-y-1">
            {analysis.cultureFit.map((c, idx) => (
              <li key={idx} className="text-[11px] text-foreground leading-relaxed pl-3 relative before:content-[''] before:w-1 before:h-1 before:bg-emerald-500 before:rounded-full before:absolute before:left-0 before:top-[7px]">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.growthPath.length > 0 && (
        <div>
          <SectionHeader icon={<TrendingUp className="w-3 h-3" />} label="可能的成长路径" />
          <ul className="space-y-1">
            {analysis.growthPath.map((g, idx) => (
              <li key={idx} className="text-[11px] text-foreground leading-relaxed pl-3 relative before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:absolute before:left-0 before:top-[7px]">
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

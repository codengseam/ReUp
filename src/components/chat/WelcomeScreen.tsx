'use client';

import React from 'react';
import Link from 'next/link';
import { Briefcase, FileText, ArrowRight } from 'lucide-react';
import {
  TrendingUp, Sparkles, Target, HelpCircle
} from 'lucide-react';
import { QUICK_ENTRIES, EXAMPLE_QUERIES } from './types';

// 图标名称到组件的映射
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  Sparkles,
  Target,
  HelpCircle,
};

interface WelcomeScreenProps {
  onQuickEntry: (query: string) => void;
}

export default function WelcomeScreen({ onQuickEntry }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-6">
        <Briefcase className="w-8 h-8 text-primary-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">你好，我是你的职场顾问</h2>
      <p className="text-sm text-muted-foreground mb-6 text-center">以资深 HR + 总裁视角，帮你解决晋升和面试问题</p>
      {/* 简历优化：主操作胶囊按钮，跳转上传页 */}
      <Link
        href="/resume"
        className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-[0.97] transition-all mb-8 shadow-sm"
      >
        <FileText className="w-4 h-4 shrink-0" />
        <span>简历优化</span>
      </Link>
      <div className="flex flex-wrap items-center justify-center gap-3 max-w-md">
        {QUICK_ENTRIES.map(entry => {
          const IconComponent = ICON_MAP[entry.icon];
          return (
            <button
              key={entry.label}
              onClick={() => onQuickEntry(entry.query)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-container text-sm font-medium text-foreground hover:bg-surface-container-high active:scale-[0.97] transition-all border border-border/20"
            >
              {IconComponent && <IconComponent className="w-4 h-4 text-primary shrink-0" />}
              <span>{entry.label}</span>
            </button>
          );
        })}
      </div>
      {/* 优秀提问案例库：精选 3 个，卡片式网格 */}
      <div className="w-full max-w-2xl mt-10 px-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">试试这样问</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EXAMPLE_QUERIES.map((group, idx) => (
            <button
              key={`${group.category}-${idx}`}
              onClick={() => onQuickEntry(group.goodExample)}
              className="group text-left p-4 rounded-xl bg-surface-container border border-border/20 hover:border-primary/30 hover:bg-surface-container-high hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {group.category}类
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs text-foreground leading-relaxed line-clamp-3 mb-2">
                {group.goodExample}
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                {group.tip}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
'use client';

import React from 'react';
import { Briefcase, ChevronRight } from 'lucide-react';
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
  expandedExamples: Record<string, boolean>;
  onToggleExample: (key: string) => void;
}

export default function WelcomeScreen({ onQuickEntry, expandedExamples, onToggleExample }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-6">
        <Briefcase className="w-8 h-8 text-primary-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">你好，我是你的职场顾问</h2>
      <p className="text-sm text-muted-foreground mb-8 text-center">以资深 HR + 总裁视角，帮你解决晋升和面试问题</p>
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
      {/* 优秀提问案例库 */}
      <div className="w-full max-w-md mt-6">
        <p className="text-xs text-muted-foreground mb-3 text-center">优秀提问参考</p>
        {EXAMPLE_QUERIES.map((group, idx) => {
          const key = `${group.category}-${idx}`;
          return (
            <div key={key} className="mb-3">
              <button
                onClick={() => onToggleExample(key)}
                className="w-full flex items-center justify-between text-xs font-medium text-primary bg-primary/10 px-2 py-1.5 rounded mb-1.5 hover:bg-primary/20 transition-colors"
              >
                <span>{group.category}类 · {group.goodExample.substring(0, 20)}...</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedExamples[key] ? 'rotate-90' : ''}`} />
              </button>
              {!expandedExamples[key] && (
                <button
                  onClick={() => onQuickEntry(group.goodExample)}
                  className="block w-full text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-2 rounded-lg transition-colors truncate"
                >
                  {group.goodExample}
                </button>
              )}
              {expandedExamples[key] && (
                <div className="space-y-2 px-2 py-2 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-[10px] text-red-500 font-medium mb-0.5">差问题</p>
                    <p className="text-xs text-muted-foreground">{group.badExample}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-green-600 font-medium mb-0.5">好问题</p>
                    <button
                      onClick={() => onQuickEntry(group.goodExample)}
                      className="block w-full text-left text-xs text-foreground hover:text-primary hover:bg-muted px-2 py-1 rounded transition-colors"
                    >
                      {group.goodExample}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">差异说明：{group.tip}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
'use client';

import React from 'react';
import Link from 'next/link';
import { Briefcase, FileText, ArrowRight, TrendingUp, Sparkles, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EXAMPLE_QUERIES } from './types';

interface SceneEntry {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  prompt?: string;
  href?: string;
}

const SCENES: SceneEntry[] = [
  { icon: TrendingUp, title: '晋升答辩', description: '梳理核心贡献与答辩逻辑', prompt: '我准备晋升答辩，如何突出核心贡献？' },
  { icon: Briefcase, title: '面试准备', description: '自我介绍与高频问题演练', prompt: '面试如何自我介绍最加分？' },
  { icon: Target, title: '能力盘点', description: '定位当前能力与晋升差距', prompt: '帮我盘点当前能力与晋升的差距' },
  { icon: FileText, title: '简历优化', description: '上传简历挖掘亮点', href: '/resume' },
];

interface WelcomeScreenProps {
  onQuickEntry: (query: string) => void;
}

export default function WelcomeScreen({ onQuickEntry }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] py-10">
      {/* Hero 区 */}
      <div className="text-center mb-10 px-4">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
          ReUp
        </h1>
        <p className="text-base md:text-lg text-foreground mt-3 font-medium">
          资深 HR + 总裁视角的职场晋升与面试顾问
        </p>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto leading-relaxed">
          从晋升答辩到面试演练，为你提供总裁级的策略洞察与可落地的话术
        </p>
      </div>

      {/* 快捷入口卡片网格：2 列（移动端 1 列） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl px-4">
        {SCENES.map(scene => {
          const Icon = scene.icon;
          const card = (
            <Card className="rounded-2xl border-border shadow-card p-5 hover:-translate-y-1 hover:shadow-float transition-all duration-200 h-full">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shadow-sm">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-foreground">{scene.title}</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">{scene.description}</p>
                </div>
              </div>
            </Card>
          );
          return scene.href ? (
            <Link key={scene.title} href={scene.href} className="block text-left">
              {card}
            </Link>
          ) : (
            <button
              key={scene.title}
              type="button"
              onClick={() => scene.prompt && onQuickEntry(scene.prompt)}
              className="block w-full text-left"
            >
              {card}
            </button>
          );
        })}
      </div>

      {/* 优秀提问案例库：精选 3 个，卡片式网格 */}
      <div className="w-full max-w-3xl mt-10 px-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">试试这样问</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EXAMPLE_QUERIES.map((group, idx) => (
            <button
              key={`${group.category}-${idx}`}
              onClick={() => onQuickEntry(group.goodExample)}
              className="group text-left p-4 rounded-xl border border-border bg-card shadow-sm hover:border-primary hover:bg-primary-container/40 transition-colors"
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

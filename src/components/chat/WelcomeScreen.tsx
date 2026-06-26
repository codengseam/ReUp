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
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-6">
        <Briefcase className="w-8 h-8 text-primary-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">你好，我是你的职场顾问</h2>
      <p className="text-sm text-muted-foreground mb-8 text-center">以资深 HR + 总裁视角，帮你解决晋升和面试问题</p>

      {/* 场景卡片：2x2 移动端 / 4x1 桌面端 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl px-4">
        {SCENES.map(scene => {
          const Icon = scene.icon;
          const card = (
            <Card className="shadow-none border-border/40 hover:border-primary transition-colors p-4 gap-2 h-full rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="font-medium text-sm text-foreground mt-2">{scene.title}</div>
              <p className="text-xs text-muted-foreground leading-snug">{scene.description}</p>
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

'use client';

import React from 'react';
import { Quote, X } from 'lucide-react';
import type { CitationData } from './types';

interface CitationDrawerProps {
  citation: CitationData;
  onClose: () => void;
}

export default function CitationDrawer({ citation, onClose }: CitationDrawerProps) {
  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-background shadow-2xl z-50 flex flex-col border-l border-border">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Quote className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">引文溯源 #{citation.id}</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {/* 来源信息 */}
        <div className="mb-4 space-y-2">
          {citation.skillName && (
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {citation.skillName}
            </div>
          )}
          {citation.category && (
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs ml-2">
              {citation.category === 'promotion' ? '晋升类' : '面试类'}
            </div>
          )}
        </div>
        {/* 原始内容 */}
        <div className="bg-primary/5 rounded-lg p-4 border-l-3 border-primary">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{citation.fullContent || citation.content}</p>
        </div>
        {/* 出处 */}
        <div className="mt-3 text-xs text-muted-foreground">
          来源: {citation.source}
        </div>
      </div>
    </div>
  );
}
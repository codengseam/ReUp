'use client';

import { Briefcase } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export interface JdInputProps {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  formatHint?: string;
}

export function JdInput({ value, onChange, id = 'jd-input', formatHint = '纯文本 / Markdown' }: JdInputProps) {
  return (
    <div className="pt-4 border-t border-border/50">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        <Briefcase className="w-3 h-3" />
        目标职位描述 (JD)
      </div>
      <Textarea
        id={id}
        rows={5}
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
        placeholder="把目标职位的 JD 粘贴到此处…"
        className="resize-y min-h-[80px] text-[12px] rounded-lg"
      />
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        填写 JD 后会在下方显示匹配度报告 · 支持 {formatHint}
      </p>
    </div>
  );
}

'use client';

// src/app/resume/_components/JdInput.tsx
// ReUp v2 Phase 4 P1 (H5): JD textarea input.
// Controlled component — parent owns the `value` + `onChange`.

import { Briefcase } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface JdInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Optional ID for the underlying <textarea> (used for label htmlFor). */
  id?: string;
  /** Optional format hint shown next to the title (e.g., "纯文本 / Markdown"). */
  formatHint?: string;
}

export function JdInput({ value, onChange, id = 'jd-input', formatHint = '纯文本 / Markdown' }: JdInputProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-primary" />
          5. 目标职位描述 (JD)
        </CardTitle>
        <CardDescription>
          粘贴目标 JD，将与简历做匹配度分析 · 支持 {formatHint}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Label htmlFor={id} className="sr-only">
          职位描述
        </Label>
        <Textarea
          id={id}
          rows={8}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder="把目标职位的 JD 粘贴到此处…"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          填写 JD 后会在下方显示匹配度报告；不填则不会渲染
        </p>
      </CardContent>
    </Card>
  );
}

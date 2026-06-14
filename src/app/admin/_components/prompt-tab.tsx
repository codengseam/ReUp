'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, Check, InfoIcon } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_SYSTEM_PROMPT } from '../_lib/constants';
import { useDebouncedCallback } from '@/hooks/use-debounce';

const CONFIG_API = '/api/admin/config';

export default function PromptTab() {
  const [prompt, setPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);
  const [localPrompt, setLocalPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);
  const localPromptRef = useRef<string>(DEFAULT_SYSTEM_PROMPT);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 从服务端加载
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${CONFIG_API}?key=prompt`);
        if (res.ok) {
          const data = await res.json();
          // 空白值视为未配置，回退到 DEFAULT_SYSTEM_PROMPT
          const trimmed = typeof data.customPrompt === 'string' ? data.customPrompt.trim() : '';
          if (trimmed) {
            setPrompt(trimmed);
            setLocalPrompt(trimmed);
            localPromptRef.current = trimmed;
          }
        }
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // 持久化到服务端
  const persistToServer = async (value: string) => {
    try {
      await fetch(CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'prompt', value: { customPrompt: value } }),
      });
    } catch { /* ignore */ }
  };

  const debouncedPersist = useDebouncedCallback(
    (value: string) => {
      setPrompt(value);
      persistToServer(value);
    },
    300
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalPrompt(value);
    localPromptRef.current = value;
    debouncedPersist(value);
  };

  const handleSave = () => {
    debouncedPersist.cancel();
    setPrompt(localPromptRef.current);
    persistToServer(localPromptRef.current);
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    toast.success('提示词已保存到服务端');
  };

  const handleReset = () => {
    if (confirm('确定恢复默认提示词？当前修改将丢失。')) {
      debouncedPersist.cancel();
      setPrompt(DEFAULT_SYSTEM_PROMPT);
      setLocalPrompt(DEFAULT_SYSTEM_PROMPT);
      localPromptRef.current = DEFAULT_SYSTEM_PROMPT;
      persistToServer(DEFAULT_SYSTEM_PROMPT);
      toast.success('已恢复默认提示词');
    }
  };

  const outline = localPrompt.split('\n').filter(l => l.startsWith('## ') || l.startsWith('### '));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">提示词管理</h2>
          <p className="text-sm text-muted-foreground mt-1">编辑系统提示词，控制 AI 的角色和行为</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-white">
            <RotateCcw className="w-3.5 h-3.5" />恢复默认
          </button>
          <button onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 shadow-sm">
            {saved ? <><Check className="w-3.5 h-3.5" />已保存</> : <><Save className="w-3.5 h-3.5" />保存</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">系统主提示词</span>
              <span className="text-[10px] text-muted-foreground">{localPrompt.length} 字</span>
            </div>
            <textarea value={localPrompt} onChange={handleTextChange}
              className="w-full min-h-[520px] p-5 text-sm font-mono leading-relaxed bg-white focus:outline-none resize-y" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <h4 className="text-xs font-semibold text-foreground mb-3">提示词结构</h4>
            {outline.length > 0 ? outline.map((line, i) => (
              <div key={i}
                className={`text-xs py-1.5 px-2 rounded mb-1 ${line.startsWith('## ') ? 'text-foreground font-medium' : 'text-muted-foreground ml-3'}`}>
                {line.replace(/^#{2,3}\s/, '')}
              </div>
            )) : (
              <p className="text-xs text-muted-foreground">暂无结构标题</p>
            )}
          </div>

          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <h4 className="text-xs font-semibold text-foreground mb-3">提示词使用说明</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              保存后的提示词存储在服务端，所有用户共享。支持完整的 Markdown 格式、指令结构和代码块。
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="flex gap-2">
              <InfoIcon className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-600">保存后新对话立即生效，已有对话不受影响。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

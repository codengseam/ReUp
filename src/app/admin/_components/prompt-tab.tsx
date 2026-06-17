'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, Check, InfoIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DEFAULT_SYSTEM_PROMPT } from '../_lib/constants';
import { useDebouncedCallback } from '@/hooks/use-debounce';

const CONFIG_API = '/api/admin/config';

type SubTab = 'system';

interface SubTabSpec {
  key: SubTab;
  configKey: string;
  label: string;
  description: string;
  defaultPrompt: string;
  defaultIsRuntime: boolean;
}

const SUB_TABS: SubTabSpec[] = [
  {
    key: 'system',
    configKey: 'prompt',
    label: '系统主提示词',
    description: '控制 AI 助手的角色与行为',
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    defaultIsRuntime: false,
  },
];

export default function PromptTab() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">提示词管理</h2>
        <p className="text-sm text-muted-foreground mt-1">
          编辑系统提示词，控制 AI 的角色与行为
        </p>
      </div>
      <Tabs defaultValue="system">
        <TabsList className="mb-4">
          {SUB_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} data-testid={`prompt-tab-${t.key}`}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SUB_TABS.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <PromptEditor spec={t} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function PromptEditor({ spec }: { spec: SubTabSpec }) {
  const [prompt, setPrompt] = useState<string>(spec.defaultPrompt);
  const [localPrompt, setLocalPrompt] = useState<string>(spec.defaultPrompt);
  const localPromptRef = useRef<string>(spec.defaultPrompt);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${CONFIG_API}?key=${encodeURIComponent(spec.configKey)}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const trimmed = typeof data.customPrompt === 'string' ? data.customPrompt.trim() : '';
          if (trimmed) {
            setPrompt(trimmed);
            setLocalPrompt(trimmed);
            localPromptRef.current = trimmed;
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [spec.configKey]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const persistToServer = async (value: string) => {
    try {
      await fetch(CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: spec.configKey, value: { customPrompt: value } }),
      });
    } catch {
      /* ignore */
    }
  };

  const debouncedPersist = useDebouncedCallback(
    (value: string) => {
      setPrompt(value);
      void persistToServer(value);
    },
    300,
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
    void persistToServer(localPromptRef.current);
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    toast.success('提示词已保存到服务端');
  };

  const handleReset = () => {
    if (!confirm('确定恢复默认提示词？当前修改将丢失。')) return;
    debouncedPersist.cancel();
    const next = spec.defaultPrompt;
    setPrompt(next);
    setLocalPrompt(next);
    localPromptRef.current = next;
    void persistToServer(next);
    toast.success(spec.defaultIsRuntime
      ? '已清空自定义提示词（将回落到内置默认）'
      : '已恢复默认提示词');
  };

  const outline = (localPrompt ?? '')
    .split('\n')
    .filter((l) => l.startsWith('## ') || l.startsWith('### '));
  const localPromptSafe = localPrompt ?? '';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{spec.label}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{spec.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            data-testid={`prompt-reset-${spec.key}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-white"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {spec.defaultIsRuntime ? '清空（用内置默认）' : '恢复默认'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-testid={`prompt-save-${spec.key}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 shadow-sm"
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                已保存
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                保存
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                {spec.label}（{spec.configKey}）
              </span>
              <span className="text-[10px] text-muted-foreground">
                {loaded ? `${localPromptSafe.length} 字` : '加载中…'}
              </span>
            </div>
            <textarea
              value={localPrompt}
              onChange={handleTextChange}
              data-testid={`prompt-textarea-${spec.key}`}
              className="w-full min-h-[420px] p-5 text-sm font-mono leading-relaxed bg-white focus:outline-none resize-y"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <h4 className="text-xs font-semibold text-foreground mb-3">提示词结构</h4>
            {outline.length > 0 ? (
              outline.map((line, i) => (
                <div
                  key={i}
                  className={`text-xs py-1.5 px-2 rounded mb-1 ${
                    line.startsWith('## ')
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground ml-3'
                  }`}
                >
                  {line.replace(/^#{2,3}\s/, '')}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">暂无结构标题</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="flex gap-2">
              <InfoIcon className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-600 leading-relaxed">
                {spec.defaultIsRuntime
                  ? 'STAR 改写提示词默认会注入 8 Skills 摘要和 few-shot 示例，运行时由代码拼接。留空时自动回落到内置默认。'
                  : '保存后的提示词存储在服务端，所有用户共享。支持完整的 Markdown 格式、指令结构和代码块。保存后立即生效。'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Save, Check, RotateCcw, BarChart3, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type { RAGParams } from '../_lib/types';
import { DEFAULT_RAG_PARAMS } from '../_lib/constants';
import { useDebouncedCallback } from '@/hooks/use-debounce';

const CONFIG_API = '/api/admin/config';

export default function RAGTab() {
  const [params, setParams] = useState<RAGParams>(DEFAULT_RAG_PARAMS);
  const [localParams, setLocalParams] = useState<RAGParams>(DEFAULT_RAG_PARAMS);
  const localParamsRef = useRef<RAGParams>(DEFAULT_RAG_PARAMS);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 从服务端加载
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${CONFIG_API}?key=rag`);
        if (res.ok) {
          const data = await res.json();
          if (data.ragParams) {
            const merged = { ...DEFAULT_RAG_PARAMS, ...data.ragParams };
            setParams(merged);
            setLocalParams(merged);
            localParamsRef.current = merged;
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
  const persistToServer = async (value: RAGParams) => {
    try {
      await fetch(CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rag', value: { ragParams: value } }),
      });
    } catch { /* ignore */ }
  };

  const debouncedPersist = useDebouncedCallback(
    (current: RAGParams) => {
      setParams(current);
      persistToServer(current);
    },
    300
  );

  const updateParam = <K extends keyof RAGParams>(key: K, value: RAGParams[K]) => {
    setLocalParams(prev => {
      const next = { ...prev, [key]: value };
      localParamsRef.current = next;
      return next;
    });
    debouncedPersist(localParamsRef.current);
  };

  const handleSave = () => {
    debouncedPersist.cancel();
    setParams(localParamsRef.current);
    persistToServer(localParamsRef.current);
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    toast.success('RAG 参数已保存到服务端');
  };

  const handleReset = () => {
    if (confirm('确定恢复默认参数？当前配置将丢失。')) {
      debouncedPersist.cancel();
      setParams(DEFAULT_RAG_PARAMS);
      setLocalParams(DEFAULT_RAG_PARAMS);
      localParamsRef.current = DEFAULT_RAG_PARAMS;
      persistToServer(DEFAULT_RAG_PARAMS);
      toast.success('已恢复默认参数');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">RAG 参数</h2>
          <p className="text-sm text-muted-foreground mt-1">调整检索增强生成的配置参数</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-white">
            <RotateCcw className="w-3.5 h-3.5" />恢复默认
          </button>
          <button onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 shadow-sm">
            {saved ? <><Check className="w-3.5 h-3.5" />已保存</> : <><Save className="w-3.5 h-3.5" />保存配置</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />检索参数
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-muted-foreground">Top-K</label>
                <span className="text-sm font-mono font-bold text-primary">{localParams.topK}</span>
              </div>
              <input type="range" min={1} max={20} value={localParams.topK}
                onChange={e => updateParam('topK', +e.target.value)}
                className="w-full accent-[#10b981]" />
              <p className="text-[10px] text-muted-foreground mt-1">返回的检索结果数量（1-20）</p>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-muted-foreground">最低相关度</label>
                <span className="text-sm font-mono font-bold text-primary">{localParams.minScore.toFixed(2)}</span>
              </div>
              <input type="range" min={0} max={100} value={localParams.minScore * 100}
                onChange={e => updateParam('minScore', +e.target.value / 100)}
                className="w-full accent-[#10b981]" />
              <p className="text-[10px] text-muted-foreground mt-1">低于此分数的结果将被过滤（0.00-1.00）</p>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-muted-foreground">上下文字符上限</label>
                <span className="text-sm font-mono font-bold text-primary">{localParams.maxChars}</span>
              </div>
              <input type="range" min={500} max={10000} step={500} value={localParams.maxChars}
                onChange={e => updateParam('maxChars', +e.target.value)}
                className="w-full accent-[#10b981]" />
              <p className="text-[10px] text-muted-foreground mt-1">注入 System Prompt 的字符上限（500-10000）</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />融合与策略
          </h3>
          <div className="space-y-5">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-muted-foreground">语义权重 / 关键词权重</label>
                <span className="text-xs font-mono text-primary">
                  {localParams.semanticWeight.toFixed(2)} / {(1 - localParams.semanticWeight).toFixed(2)}
                </span>
              </div>
              <input type="range" min={0} max={100} value={localParams.semanticWeight * 100}
                onChange={e => updateParam('semanticWeight', +e.target.value / 100)}
                className="w-full accent-[#10b981]" />
              <div className="h-2 rounded-full overflow-hidden bg-muted mt-2 flex">
                <div className="bg-primary h-full" style={{ width: `${localParams.semanticWeight * 100}%` }} />
                <div className="bg-amber-400 h-full" style={{ width: `${(1 - localParams.semanticWeight) * 100}%` }} />
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-xs font-medium text-foreground">HyDE 增强</p>
                <p className="text-[10px] text-muted-foreground">生成假设答案辅助检索</p>
              </div>
              <button onClick={() => updateParam('hydeEnabled', !localParams.hydeEnabled)}
                className={`w-10 h-6 rounded-full transition-colors ${localParams.hydeEnabled ? 'bg-primary' : 'bg-muted-foreground/20'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow mx-1 transition-transform ${localParams.hydeEnabled ? 'translate-x-4' : ''}`} />
              </button>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-xs font-medium text-foreground">LLM Rerank</p>
                <p className="text-[10px] text-muted-foreground">LLM 重排序检索结果</p>
              </div>
              <button onClick={() => updateParam('rerankEnabled', !localParams.rerankEnabled)}
                className={`w-10 h-6 rounded-full transition-colors ${localParams.rerankEnabled ? 'bg-primary' : 'bg-muted-foreground/20'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow mx-1 transition-transform ${localParams.rerankEnabled ? 'translate-x-4' : ''}`} />
              </button>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-xs font-medium text-foreground">缓存 TTL</p>
              </div>
              <select value={localParams.cacheTTL}
                onChange={e => updateParam('cacheTTL', +e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white">
                <option value={1}>1 分钟</option>
                <option value={5}>5 分钟</option>
                <option value={15}>15 分钟</option>
                <option value={30}>30 分钟</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-muted/30 border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold text-foreground mb-2">当前配置摘要</h4>
        <div className="flex flex-wrap gap-3">
          {[
            `Top-K: ${localParams.topK}`,
            `MinScore: ${localParams.minScore.toFixed(2)}`,
            `MaxChars: ${localParams.maxChars}`,
            `语义权重: ${localParams.semanticWeight.toFixed(2)}`,
            `HyDE: ${localParams.hydeEnabled ? '开' : '关'}`,
            `Rerank: ${localParams.rerankEnabled ? '开' : '关'}`,
            `TTL: ${localParams.cacheTTL}min`,
          ].map(item => (
            <span key={item} className="text-[10px] font-mono bg-white px-2 py-1 rounded border border-border text-muted-foreground">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

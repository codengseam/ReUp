'use client';

import React, { useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Search, Loader2 } from 'lucide-react';

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  isListening: boolean;
  suggestions: string[];
  estimatedSeconds: number | null;
  modelName: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onToggleVoice: () => void;
  onSuggestionClick: (suggestion: string) => void;
}

export default function ChatInput({
  input,
  isLoading,
  isListening,
  suggestions,
  estimatedSeconds,
  modelName,
  onInputChange,
  onSend,
  onStop,
  onToggleVoice,
  onSuggestionClick,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // textarea 自适应高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3">
      <div className="max-w-[680px] mx-auto">
        {/* 输入联想建议 */}
        {suggestions.length > 0 && !isLoading && (
          <div className="mb-2 space-y-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s)}
                className="w-full text-left px-3 py-2 rounded-lg border border-border bg-card shadow-sm hover:border-primary hover:bg-primary-container/40 transition-colors text-sm text-muted-foreground flex items-center gap-2"
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-card border border-border shadow-card rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的职场问题..."
            rows={1}
            className="flex-1 border-0 outline-none bg-transparent focus:ring-0 text-sm text-foreground placeholder:text-muted-foreground resize-none max-h-[150px] py-1.5"
            disabled={isLoading}
          />

          {/* 语音输入 */}
          <button
            onClick={onToggleVoice}
            className={`shrink-0 p-2 rounded-full transition-colors ${
              isListening ? 'bg-red-50 text-red-500 animate-pulse' : 'hover:bg-muted text-muted-foreground'
            }`}
            title={isListening ? '停止录音' : '语音输入'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* 发送 / 停止按钮：流式生成时变形为停止按钮（同位置，避免布局抖动） */}
          <button
            onClick={isLoading ? onStop : onSend}
            disabled={!isLoading && !input.trim()}
            aria-label={isLoading ? '停止生成' : '发送'}
            title={isLoading ? '停止生成' : '发送'}
            className={`shrink-0 p-2.5 rounded-full transition-all ${
              isLoading || input.trim()
                ? 'bg-gradient-to-br from-primary to-emerald-600 text-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95'
                : 'bg-muted text-muted-foreground/40'
            }`}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground mt-2">
          <span>AI 回复仅供参考，不构成专业建议</span>
          <span>·</span>
          <span>当前模型: {modelName}</span>
          {estimatedSeconds !== null && estimatedSeconds > 0 && (
            <>
              <span>·</span>
              <span>预计 ~{estimatedSeconds}s</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

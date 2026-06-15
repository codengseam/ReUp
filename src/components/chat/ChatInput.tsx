'use client';

import React, { useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Search } from 'lucide-react';

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  isListening: boolean;
  suggestions: string[];
  estimatedSeconds: number | null;
  modelName: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
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
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm text-muted-foreground flex items-center gap-2"
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-muted rounded-2xl px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的职场问题..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none max-h-[150px] py-1.5"
            disabled={isLoading}
          />

          {/* 语音输入 */}
          <button
            onClick={onToggleVoice}
            className={`p-2 rounded-xl transition-colors ${
              isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-muted-foreground/10 text-muted-foreground'
            }`}
            title={isListening ? '停止录音' : '语音输入'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* 发送按钮 */}
          <button
            onClick={onSend}
            disabled={!input.trim() || isLoading}
            className={`p-2.5 rounded-xl transition-all ${
              input.trim() && !isLoading
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-muted-foreground/10 text-muted-foreground/40'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
          AI 回复仅供参考，不构成专业建议 · 当前模型: {modelName}
        </p>
      </div>
    </div>
  );
}
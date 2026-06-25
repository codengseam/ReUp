'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { safeTrack } from '@/shared/utils/analytics-helpers';
import type { InterviewTranscript } from '@/shared/types/interview';

interface Props {
  onTranscriptReady: (transcript: InterviewTranscript) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createRecognition(): any {
  const win = window as unknown as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition?: new () => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition?: new () => any;
  };
  const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) return null;
  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = true;
  return recognition;
}

export default function TranscriptUpload({ onTranscriptReady }: Props) {
  const [text, setText] = useState('');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [round, setRound] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);

  const toggleVoice = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = createRecognition();
    if (!recognition) {
      alert('您的浏览器不支持语音输入');
      return;
    }

    recognitionRef.current = recognition;
    setIsListening(true);

    recognition.onresult = (event: Event) => {
      const srEvent = event as unknown as {
        results: { [key: number]: { [index: number]: { transcript: string }; isFinal: boolean } };
      };
      const transcript = Array.from(
        { length: Object.keys(srEvent.results).length },
        (_, i) => srEvent.results[i]?.[0]?.transcript || ''
      ).join('');
      setText(prev => prev + transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [isListening]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError('');
    setSuccess(false);
    const source: 'text' | 'voice' = isListening ? 'voice' : 'text';

    try {
      const res = await fetch('/api/interview/transcript/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          meta: {
            company: company.trim() || undefined,
            position: position.trim() || undefined,
            round: round.trim() || undefined,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSuccess(true);
      onTranscriptReady(data.transcript);

      // Track transcript_upload: source is 'voice' if the user was
      // actively recording at submit time, otherwise 'text'. The SDK
      // payload only carries `source`; company/position/questionCount
      // are intentionally not duplicated to keep type-safety strict.
      safeTrack({ type: 'transcript_upload', data: { source } });
    } catch (e) {
      const message = e instanceof Error ? e.message : '上传失败';
      setError(message);
      safeTrack({
        type: 'error',
        data: {
          message,
          stack: e instanceof Error ? e.stack ?? undefined : undefined,
        },
      });
    } finally {
      setIsLoading(false);
    }
  }, [text, company, position, round, isListening, onTranscriptReady]);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">上传面经</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Meta fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">公司</label>
            <Input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="如：字节跳动"
              className="h-9"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">职位</label>
            <Input
              value={position}
              onChange={e => setPosition(e.target.value)}
              placeholder="如：高级前端工程师"
              className="h-9"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">面试轮次</label>
            <Input
              value={round}
              onChange={e => setRound(e.target.value)}
              placeholder="如：二面"
              className="h-9"
            />
          </div>
        </div>

        {/* Textarea */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            面试经历
          </label>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="请粘贴或口述你的面试经历，包括面试问题、你的回答、面试结果等..."
            className="min-h-32 resize-y"
            rows={8}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            onClick={toggleVoice}
            variant="outline"
            size="sm"
            className={`gap-2 ${isListening ? 'text-red-500 border-red-300 hover:text-red-600' : ''}`}
            disabled={isLoading}
          >
            {isListening ? (
              <>
                <MicOff className="h-4 w-4" />
                停止录音
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                语音输入
              </>
            )}
          </Button>

          <div className="flex items-center gap-3">
            {isListening && (
              <Badge variant="outline" className="animate-pulse text-red-500 border-red-300">
                录音中...
              </Badge>
            )}
            {success && (
              <Badge variant="default" className="bg-emerald-500 gap-1">
                <CheckCircle className="h-3 w-3" />
                解析成功
              </Badge>
            )}
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !text.trim()}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  提交解析
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
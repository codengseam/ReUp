'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Square, Loader2, Send, User, Bot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/shared/utils/utils';
import { safeTrack } from '@/shared/utils/analytics-helpers';
import InterviewReport from './InterviewReport';

// ---------- types ----------

interface InterviewMessage {
  role: 'interviewer' | 'candidate';
  content: string;
  feedback?: string;
  timestamp: number;
}

interface InterviewReportData {
  overallScore: number;
  phaseScores: {
    selfIntro: number;
    projectDeepDive: number;
    techAssessment: number;
    behavioral: number;
  };
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  summary: string;
}

type Phase = '自我介绍' | '项目深挖' | '技术考察' | '行为面试';

const PHASES: Phase[] = ['自我介绍', '项目深挖', '技术考察', '行为面试'];

const PHASE_LABELS: Record<Phase, string> = {
  '自我介绍': '自我介绍',
  '项目深挖': '项目深挖',
  '技术考察': '技术考察',
  '行为面试': '行为面试',
};

// ---------- component ----------

interface Props {
  resumeId?: string;
  jdText?: string;
}

export default function InterviewChat({ resumeId, jdText }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [phase, setPhase] = useState<Phase>('自我介绍');
  const [report, setReport] = useState<InterviewReportData | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number | null>(null);

  // auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---------- start interview ----------

  const startInterview = useCallback(async () => {
    setIsStarting(true);
    setError('');

    // Track interview_coach_start. SDK only carries `hasJd`; the
    // initial phase is always 'self-intro' from the UI's perspective.
    safeTrack({ type: 'interview_coach_start', data: { hasJd: Boolean(jdText) } });

    try {
      const res = await fetch('/api/interview/coach/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId, jdText }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSessionId(data.sessionId);
      setHasStarted(true);
      setPhase('自我介绍');
      setMessages([
        {
          role: 'interviewer',
          content: data.openingQuestion,
          timestamp: Date.now(),
        },
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : '启动面试失败';
      setError(message);
      safeTrack({
        type: 'error',
        data: {
          message,
          stack: e instanceof Error ? e.stack ?? undefined : undefined,
        },
      });
    } finally {
      setIsStarting(false);
    }
  }, [resumeId, jdText]);

  // ---------- send message (SSE streaming) ----------

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading || !sessionId) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: InterviewMessage = {
      role: 'candidate',
      content: text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError('');

    const assistantId = Date.now().toString();
    const assistantMsg: InterviewMessage = {
      role: 'interviewer',
      content: '',
      timestamp: Date.now(),
    };

    try {
      const res = await fetch('/api/interview/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ sessionId, message: text }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let buffer = '';
      let contentAccum = '';
      let feedbackAccum = '';

      setMessages(prev => [...prev, assistantMsg]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.content) {
              contentAccum += parsed.content;
              setMessages(prev =>
                prev.map(m =>
                  m.role === 'interviewer' && m.content === '' && m.timestamp === assistantMsg.timestamp
                    ? { ...m, content: contentAccum }
                    : m.role === 'interviewer' && m.content === contentAccum.slice(0, -parsed.content.length)
                    ? { ...m, content: contentAccum }
                    : m
                )
              );
            }

            if (parsed.feedback) {
              feedbackAccum = parsed.feedback;
            }

            if (parsed.phase) {
              setPhase(parsed.phase as Phase);
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      // finalize with feedback
      if (feedbackAccum) {
        setMessages(prev =>
          prev.map(m =>
            m.role === 'interviewer' && m.content === contentAccum
              ? { ...m, feedback: feedbackAccum }
              : m
          )
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      const message = e instanceof Error ? e.message : '发送失败';
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
      abortRef.current = null;
    }
  }, [input, isLoading, sessionId]);

  // ---------- end interview ----------

  const endInterview = useCallback(async () => {
    if (!sessionId) return;
    setIsGeneratingReport(true);
    setError('');
    const startedAt = startedAtRef.current;
    try {
      const res = await fetch('/api/interview/coach/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReport(data);
      setHasEnded(true);

      // Track interview_coach_end: count user messages as a proxy
      // for total exchanges; SDK only carries `messageCount`.
      const userMessages = messages.filter((m) => m.role === 'candidate').length;
      safeTrack({ type: 'interview_coach_end', data: { messageCount: userMessages } });
      void startedAt; // reserved for future duration tracking
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成报告失败';
      setError(message);
      safeTrack({
        type: 'error',
        data: {
          message,
          stack: e instanceof Error ? e.stack ?? undefined : undefined,
        },
      });
    } finally {
      setIsGeneratingReport(false);
    }
  }, [sessionId, messages]);

  const reset = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setInput('');
    setReport(null);
    setHasStarted(false);
    setHasEnded(false);
    setPhase('自我介绍');
    setError('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // ---------- render ----------

  // show report
  if (report && hasEnded) {
    return (
      <div className="space-y-6">
        <InterviewReport report={report} onRestart={reset} />
      </div>
    );
  }

  // idle state
  if (!hasStarted) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-center">AI 模拟面试</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            AI 将根据你的简历{jdText ? '和 JD' : ''}扮演面试官，进行多轮模拟面试，覆盖自我介绍、项目深挖、技术考察、行为面试等环节。
          </p>
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
          <div className="flex justify-center">
            <Button
              onClick={startInterview}
              disabled={isStarting}
              className="gap-2"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在准备...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  开始面试
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // active interview
  const currentPhaseIdx = PHASES.indexOf(phase);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* phase indicator */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              当前阶段：
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {PHASES.map((p, i) => (
                <Badge
                  key={p}
                  variant={i === currentPhaseIdx ? 'default' : 'outline'}
                  className={cn(
                    'text-xs',
                    i === currentPhaseIdx
                      ? 'bg-primary text-primary-foreground'
                      : i < currentPhaseIdx
                      ? 'opacity-50'
                      : ''
                  )}
                >
                  {PHASE_LABELS[p]}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* messages */}
      <Card className="flex-1">
        <CardContent className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {messages.map((msg, idx) => {
            const isInterviewer = msg.role === 'interviewer';
            return (
              <div
                key={idx}
                className={cn(
                  'flex gap-3',
                  isInterviewer ? 'justify-start' : 'justify-end'
                )}
              >
                {isInterviewer && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-4 py-2.5 text-sm',
                    isInterviewer
                      ? 'bg-muted text-foreground'
                      : 'bg-primary text-primary-foreground'
                  )}
                >
                  {msg.content || (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      正在思考...
                    </span>
                  )}
                  {msg.feedback && (
                    <div className="mt-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                      <span className="font-medium text-amber-500">点评：</span>
                      {msg.feedback}
                    </div>
                  )}
                </div>
                {!isInterviewer && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-emerald-500 text-white text-xs">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </CardContent>
      </Card>

      {/* error */}
      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      {/* input area */}
      <Card>
        <CardContent className="py-3">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的回答..."
              disabled={isLoading}
              className="min-h-10 resize-none"
              rows={2}
            />
            <div className="flex flex-col gap-2 shrink-0">
              <Button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="h-9 w-9"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={endInterview}
                disabled={isGeneratingReport || isLoading || messages.length < 2}
                variant="outline"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
              >
                {isGeneratingReport ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
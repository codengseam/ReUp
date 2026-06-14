'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2, Lock, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { parseResume } from '@/lib/resume/parser';
import { loadResume, saveResume } from '@/lib/resume/storage';
import { isPrivacyMode } from '@/lib/resume/privacy';
import type { ResumeDocument, ResumeSource } from '@/lib/resume/types';
import type { StarRewriteResult } from '@/lib/resume/star-rewriter';
import { ExportButtons } from './_components/ExportButtons';
import { JdInput } from './_components/JdInput';
import { MatchReportCard } from './_components/MatchReportCard';
import { ParsePreview } from './_components/ParsePreview';
import { PrivacyToggle } from './_components/PrivacyToggle';
import { StreamingResult } from './_components/StreamingResult';

type ResumeFormat = 'pdf' | 'word' | 'markdown' | 'text';

const FORMAT_LABELS: Record<ResumeFormat, string> = {
  pdf: 'PDF',
  word: 'Word (.docx)',
  markdown: 'Markdown',
  text: 'Text',
};

const FORMAT_VALUES: readonly ResumeFormat[] = ['pdf', 'word', 'markdown', 'text'] as const;

function detectFormat(name: string): ResumeFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'word';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  return 'text';
}

function toResumeSource(format: ResumeFormat): ResumeSource {
  if (format === 'markdown') return 'md';
  return format;
}

// H2 (upload) + H3 (parse preview) + H4 (streaming result) orchestrator.
// The page is a client component. PDF/Word parsing is server-only
// (depends on Buffer + pdf-parse/mammoth), so for now we accept only
// text/md submissions and surface a friendly error for the other two.
export default function ResumeUploadPage() {
  const [fileName, setFileName] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [format, setFormat] = useState<ResumeFormat>('text');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [notice, setNotice] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string>('');
  const [parsedResume, setParsedResume] = useState<ResumeDocument | null>(null);
  const [jd, setJd] = useState<string>('');
  const [privacyMode, setPrivacyModeState] = useState<boolean>(false);
  const [lastStarResult, setLastStarResult] = useState<StarRewriteResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // G1: hydrate from localStorage on mount, then remember privacy mode.
  useEffect(() => {
    const saved = loadResume();
    if (saved) {
      setParsedResume(saved);
      // Re-hydrate the editor with the saved source text so the user can
      // re-parse or tweak format without re-pasting.
      if (saved.raw) setPastedText(saved.raw);
      setFormat(saved.meta.source === 'md' ? 'markdown' : saved.meta.source);
    }
    setPrivacyModeState(isPrivacyMode());
  }, []);

  const hasInput = fileName.trim().length > 0 || pastedText.trim().length > 0;
  const canSubmit = hasInput;

  const resetDownstream = useCallback(() => {
    setParsedResume(null);
    setParseError('');
    setNotice('');
  }, []);

  // G2: drop any reference to the uploaded File so the browser can GC it.
  // The TextDecoder/string already holds the parsed content we need.
  const clearFileInput = useCallback(() => {
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      const detected = detectFormat(file.name);
      setFormat(detected);
      // 文本/Markdown 顺带把内容读进 textarea，避免重复粘贴
      if (detected === 'text' || detected === 'markdown') {
        const text = await file.text();
        setPastedText(text);
      } else {
        // PDF / Word 仅占位文件名，二进制内容留给下游解析
        setPastedText('');
      }
      resetDownstream();
    },
    [resetDownstream]
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile]
  );

  const onTextChange = useCallback(
    (value: string) => {
      setPastedText(value);
      resetDownstream();
    },
    [resetDownstream]
  );

  const onFormatChange = useCallback(
    (next: ResumeFormat) => {
      setFormat(next);
      resetDownstream();
    },
    [resetDownstream]
  );

  const onSubmit = useCallback(async () => {
    setNotice('');
    setParseError('');
    setIsParsing(true);
    try {
      const source = toResumeSource(format);
      if (source !== 'text' && source !== 'md') {
        // PDF / Word 解析器尚未集成（A3/A4 子任务待落地），先给用户友好提示。
        throw new Error(
          `${FORMAT_LABELS[format]} 解析器尚未接入（等待 A3/A4 子任务落地），请先用 Markdown 或纯文本格式测试。`
        );
      }
      if (!pastedText.trim()) {
        throw new Error('请粘贴简历文本后再开始优化');
      }
      const doc = await parseResume(pastedText, source);
      setParsedResume(doc);
      // G1: persist locally so refresh / re-open keeps the parsed doc.
      saveResume(doc);
      // G2: release the original File reference + clear the input.
      clearFileInput();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(msg);
      setParsedResume(null);
    } finally {
      setIsParsing(false);
    }
  }, [clearFileInput, format, pastedText]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-14 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Link>
          </Button>
          <div>
            <h1 className="text-sm font-semibold leading-tight">简历优化</h1>
            <p className="text-[10px] text-muted-foreground">上传简历，开启 STAR 重写</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. 拖放文件</CardTitle>
            <CardDescription>支持 PDF / Word / Markdown / 纯文本</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-lg border-2 border-dashed transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/30'
              }`}
            >
              <UploadCloud className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-foreground">拖放简历文件到此处</p>
              {fileName && (
                <p className="text-xs text-muted-foreground">已选择：{fileName}</p>
              )}
              <Label
                htmlFor="resume-file-input"
                className="cursor-pointer text-xs text-primary hover:underline"
              >
                或点击选择文件
              </Label>
              <Input
                id="resume-file-input"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.md,.markdown,.txt,text/plain"
                onChange={onFileInputChange}
                className="hidden"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. 直接粘贴文本</CardTitle>
            <CardDescription>没有文件？把简历内容直接粘贴到这里</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={10}
              value={pastedText}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="把简历内容粘贴到此处…"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. 简历格式</CardTitle>
            <CardDescription>选错格式也不会让解析失败，下游会自动归一化</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={format}
              onValueChange={(v) => onFormatChange(v as ResumeFormat)}
              className="grid grid-cols-2 gap-3"
            >
              {FORMAT_VALUES.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <RadioGroupItem value={f} id={`fmt-${f}`} />
                  <Label htmlFor={`fmt-${f}`}>{FORMAT_LABELS[f]}</Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {privacyMode && (
          <div
            role="status"
            data-testid="privacy-notice"
            className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded"
          >
            <Lock className="w-3.5 h-3.5" />
            本地模式：所有解析均在浏览器内进行，简历内容不会上传到服务器。
          </div>
        )}

        <PrivacyToggle enabled={privacyMode} onChange={setPrivacyModeState} />

        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={() => {
              void onSubmit();
            }}
            disabled={!canSubmit || isParsing}
            className="w-full"
            size="lg"
          >
            {isParsing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-1" />
            )}
            {isParsing ? '解析中…' : '开始优化'}
          </Button>
          {parseError && (
            <div
              role="status"
              className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded"
            >
              {parseError}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded"
            >
              {notice}
            </div>
          )}
          {!hasInput && (
            <p className="text-[11px] text-muted-foreground text-center">
              请拖放文件或粘贴简历文本后再开始优化
            </p>
          )}
        </div>

        {parsedResume && <ParsePreview resume={parsedResume} />}
        {parsedResume && (
          <StreamingResult
            resume={parsedResume}
            onComplete={(result) => {
              setLastStarResult(result);
            }}
          />
        )}
        {parsedResume && <ExportButtons resume={parsedResume} starResult={lastStarResult} />}
        {parsedResume && <JdInput value={jd} onChange={setJd} />}
        {parsedResume && jd.trim().length > 0 && (
          <MatchReportCard resume={parsedResume} jd={jd} />
        )}
      </main>
    </div>
  );
}

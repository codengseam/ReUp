'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2, Lock, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { parseTextResume } from '@/lib/resume/parser-text';
import { parseMdResume } from '@/lib/resume/parser-md';
import { loadResume, saveResume } from '@/lib/resume/storage';
import { isPrivacyMode, setPrivacyMode } from '@/lib/resume/privacy';
import type { ResumeDocument, ResumeSource } from '@/lib/resume/types';
import type { StarRewriteResult } from '@/lib/resume/star-rewriter';
import { ExportButtons } from './_components/ExportButtons';
import { JdInput } from './_components/JdInput';
import { MatchReportCard } from './_components/MatchReportCard';
import { ParsePreview } from './_components/ParsePreview';
import { StreamingResult } from './_components/StreamingResult';

type ResumeFormat = 'pdf' | 'word' | 'markdown' | 'text';

const FORMAT_LABELS: Record<ResumeFormat, string> = {
  pdf: 'PDF',
  word: 'Word',
  markdown: 'Markdown',
  text: '纯文本',
};

const FORMAT_VALUES: readonly ResumeFormat[] = ['pdf', 'word', 'markdown', 'text'] as const;

function detectFormat(name: string): ResumeFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'word';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  return 'text';
}

/** Client-side parse: only text/md. PDF/Word go through the API route. */
async function parseClientSide(text: string, source: ResumeSource): Promise<ResumeDocument> {
  if (source === 'md') return parseMdResume(text);
  return parseTextResume(text, source as 'text');
}

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

  useEffect(() => {
    const saved = loadResume();
    if (saved) {
      setParsedResume(saved);
      if (saved.raw) setPastedText(saved.raw);
      setFormat(saved.meta.source === 'md' ? 'markdown' : saved.meta.source === 'pdf+llm' ? 'pdf' : saved.meta.source);
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

  const clearFileInput = useCallback(() => {
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      const detected = detectFormat(file.name);
      setFormat(detected);
      if (detected === 'text' || detected === 'markdown') {
        const text = await file.text();
        setPastedText(text);
      } else {
        setPastedText('');
      }
      resetDownstream();
    },
    [resetDownstream],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
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
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onTextChange = useCallback(
    (value: string) => {
      setPastedText(value);
      resetDownstream();
    },
    [resetDownstream],
  );

  const onFormatChange = useCallback(
    (next: ResumeFormat) => {
      setFormat(next);
      resetDownstream();
    },
    [resetDownstream],
  );

  const onSubmit = useCallback(async () => {
    setNotice('');
    setParseError('');
    setIsParsing(true);
    try {
      if (format === 'pdf' || format === 'word') {
        const file = fileInputRef.current?.files?.[0];
        if (!file) throw new Error(`请先选择 ${FORMAT_LABELS[format]} 文件后再开始优化`);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('source', format);
        const r = await fetch('/api/resume/parse', { method: 'POST', body: fd });
        const json = (await r.json()) as {
          ok: boolean; doc?: ResumeDocument; error?: string; message?: string;
        };
        if (!json.ok) {
          const friendly: Record<string, string> = {
            missing_file: '文件未上传，请重新选择。',
            missing_source: '请求参数缺失，请刷新页面重试。',
            invalid_source: '仅支持 PDF / DOCX 格式。',
            invalid_mime: '仅支持 PDF / DOCX 文件，请重新选择。',
            file_too_large: '文件过大（>10MB），请压缩或拆分为单页。',
          };
          if (json.error === 'parse_failed') {
            throw new Error(`${format === 'pdf' ? 'PDF' : 'Word'} 解析失败：${json.message ?? '未知错误'}。请用 Markdown/文本重试。`);
          }
          throw new Error(friendly[json.error ?? ''] ?? '上传解析失败，请重试。');
        }
        if (!json.doc) throw new Error('服务器未返回解析结果');
        setParsedResume(json.doc);
        saveResume(json.doc);
        clearFileInput();
        return;
      }
      if (!pastedText.trim()) throw new Error('请粘贴简历文本后再开始优化');
      const source: ResumeSource = format === 'markdown' ? 'md' : format;
      const doc = await parseClientSide(pastedText, source);
      setParsedResume(doc);
      saveResume(doc);
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
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Nav */}
      <header className="h-[52px] flex items-center justify-between px-5 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
            <Link href="/">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              返回
            </Link>
          </Button>
          <h1 className="text-sm font-semibold">简历优化</h1>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-primary-container text-accent-foreground">
          AI Powered
        </span>
      </header>

      {/* Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Input */}
        <aside className="w-[380px] shrink-0 bg-muted/50 border-r border-border overflow-y-auto">
          <div className="p-5 flex flex-col gap-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              上传简历
            </p>

            {/* Drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-[1.5px] border-dashed transition-all cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-primary/40'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center">
                <UploadCloud className="w-[18px] h-[18px] text-primary" />
              </div>
              <p className="text-[13px] font-medium text-foreground">拖放或点击上传</p>
              <p className="text-[11px] text-muted-foreground">PDF / Word / Markdown / 纯文本</p>
              {fileName && (
                <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-md bg-primary-container text-[11px] text-accent-foreground">
                  <FileText className="w-3 h-3" />
                  {fileName}
                </span>
              )}
              <Label
                htmlFor="resume-file-input"
                className="cursor-pointer text-[11px] text-primary hover:underline mt-1"
              >
                选择文件
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

            {/* Textarea */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                或直接粘贴
              </p>
              <Textarea
                rows={5}
                value={pastedText}
                onChange={(e) => onTextChange(e.target.value)}
                placeholder="把简历内容粘贴到此处…"
                className="resize-y min-h-[80px] rounded-lg text-[13px]"
              />
            </div>

            {/* Segmented format control */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                格式
              </p>
              <div className="flex bg-secondary rounded-lg p-[3px] gap-0.5">
                {FORMAT_VALUES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onFormatChange(f)}
                    className={`flex-1 text-center py-1.5 text-[11px] font-medium rounded-md transition-all ${
                      format === f
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy */}
            {privacyMode && (
              <div
                role="status"
                data-testid="privacy-notice"
                className="flex items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg"
              >
                <Lock className="w-3.5 h-3.5" />
                本地模式：简历不会上传到服务器
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-2.5 bg-background rounded-lg border border-border">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Lock className="w-3.5 h-3.5 text-primary" />
                本地模式
              </div>
              <div className="flex items-center gap-2">
                {privacyMode && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                    本地
                  </span>
                )}
                <Switch
                  checked={privacyMode}
                  onCheckedChange={(checked) => {
                    setPrivacyModeState(checked);
                    setPrivacyMode(checked);
                  }}
                  aria-label="本地优先模式"
                />
              </div>
            </div>

            {/* Error / notice */}
            {parseError && (
              <div role="status" className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                {parseError}
              </div>
            )}
            {notice && (
              <div role="status" className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                {notice}
              </div>
            )}

            {/* CTA */}
            <Button
              onClick={() => { void onSubmit(); }}
              disabled={!canSubmit || isParsing}
              className="w-full h-11 rounded-lg text-[13px] font-semibold"
              size="lg"
            >
              {isParsing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-1.5" />
              )}
              {isParsing ? '解析中…' : '开始优化'}
            </Button>
            {!hasInput && (
              <p className="text-[10px] text-muted-foreground text-center -mt-2">
                请拖放文件或粘贴简历文本后再开始优化
              </p>
            )}
          </div>
        </aside>

        {/* Right Panel: Results */}
        <main className="flex-1 overflow-y-auto bg-background">
          {!parsedResume ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center mb-4">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground mb-1">等待上传简历</h2>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                在左侧面板上传或粘贴简历，解析结果将在这里展示
              </p>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              <ParsePreview resume={parsedResume} />
              <StreamingResult
                resume={parsedResume}
                onComplete={(result) => { setLastStarResult(result); }}
              />
              <ExportButtons resume={parsedResume} starResult={lastStarResult} />
              <JdInput value={jd} onChange={setJd} />
              {jd.trim().length > 0 && (
                <MatchReportCard resume={parsedResume} jd={jd} />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

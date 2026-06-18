'use client';

import { useCallback, useEffect, useState, type DragEvent, type ChangeEvent } from 'react';
import {
  ArrowLeft, FileText, Loader2, UploadCloud, AlertCircle,
  Eye, BarChart3, ClipboardCheck, Target, FileSearch,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { safeTrack } from '@/shared/utils/analytics-helpers';
import { ResumeRawCompare } from './ResumeRawCompare';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { MatchGauge } from './MatchGauge';
import { JdCard } from '../jd/JdCard';
import type { ResumeDocument, ATSResult, MatchReport } from '@/features/resume/types';
import type { JDDocument } from '@/features/jd/types';
import type { DiagnosticResult } from '@/features/resume/diagnostics';

type AnalysisState = 'idle' | 'analyzing' | 'done' | 'error';

interface AnalyzeResponse {
  ok: boolean;
  resume?: ResumeDocument;
  jd?: JDDocument;
  diagnostics?: DiagnosticResult;
  ats?: ATSResult;
  match?: MatchReport;
  error?: string;
}

export function ResumeAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [rawText, setRawText] = useState('');
  const [jdText, setJdText] = useState('');
  const [state, setState] = useState<AnalysisState>('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [resume, setResume] = useState<ResumeDocument | null>(null);
  const [jd, setJd] = useState<JDDocument | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [atsResult, setAtsResult] = useState<ATSResult | null>(null);
  const [matchReport, setMatchReport] = useState<MatchReport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hasInput = (file !== null || rawText.trim().length > 0) && jdText.trim().length > 0;

  useEffect(() => {
    safeTrack({ type: 'page_view', page: '/resume/analyzer' });
  }, []);

  const reset = useCallback(() => {
    setState('idle'); setError(''); setProgress(0);
    setResume(null); setJd(null); setDiagnostics(null);
    setAtsResult(null); setMatchReport(null);
  }, []);

  const handleFile = useCallback(async (uploaded: File) => {
    setFile(uploaded);
    setFileName(uploaded.name);
    setFileSize(uploaded.size);
    const isBinary =
      uploaded.type === 'application/pdf' ||
      uploaded.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    setRawText(isBinary ? `[已上传 ${uploaded.name}]` : await uploaded.text());
    if (!jdText.trim()) setState('idle');
  }, [jdText]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); }, []);
  const onFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onAnalyze = useCallback(async () => {
    if (!hasInput) return;
    setState('analyzing'); setError(''); setProgress(10);
    const timer = setInterval(() => setProgress((p) => Math.min(p + 5, 90)), 400);

    // Track resume_upload: derive format from filename extension, fall back to 'txt'.
    const format = (() => {
      const m = /\.([a-z0-9]+)$/i.exec(fileName);
      if (!m) return 'txt';
      const ext = m[1].toLowerCase();
      if (ext === 'markdown') return 'md';
      return ext;
    })();
    safeTrack({ type: 'resume_upload', data: { format, fileSize } });

    // Track jd_parse: only fired when JD text is non-empty.
    safeTrack({ type: 'jd_parse', data: { source: 'paste' } });

    try {
      const formData = new FormData();
      const resumeFile = file ?? new File([rawText], 'pasted-resume.txt', { type: 'text/plain' });
      formData.append('resumeFile', resumeFile);
      if (jdText.trim()) formData.append('jdText', jdText.trim());

      const res = await fetch('/api/resume/analyze', {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json()) as AnalyzeResponse;
      clearInterval(timer); setProgress(100);
      if (!json.ok) { setError(json.error ?? '分析失败'); setState('error'); return; }
      setResume(json.resume ?? null);
      setJd(json.jd ?? null);
      setDiagnostics(json.diagnostics ?? null);
      setAtsResult(json.ats ?? null);
      if (json.resume && json.ats) {
        setMatchReport(json.match ?? { strengths: [], gaps: [], priorities: [] });
      }
      setState('done');

      // Track match_analysis: score comes from ATS coverage.
      const score = json.ats?.coverage?.percentage ?? 0;
      safeTrack({ type: 'match_analysis', data: { score: Math.round(score) } });
    } catch (err) {
      clearInterval(timer);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      safeTrack({
        type: 'error',
        data: {
          message,
          stack: err instanceof Error ? err.stack ?? undefined : undefined,
        },
      });
    }
  }, [hasInput, file, rawText, jdText, fileName, fileSize]);

  const dragClass = isDragging
    ? 'border-primary bg-primary/5'
    : 'border-border bg-background hover:border-primary/40';

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-[52px] flex items-center justify-between px-5 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
            <Link href="/"><ArrowLeft className="w-3.5 h-3.5 mr-1" />返回</Link>
          </Button>
          <h1 className="text-sm font-semibold">简历优化工作台</h1>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-primary-container text-accent-foreground">AI Powered</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <aside className="w-[380px] shrink-0 bg-muted/50 border-r border-border overflow-y-auto">
          <div className="p-5 flex flex-col gap-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">上传简历 + JD</p>

            <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
              className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-[1.5px] border-dashed transition-all cursor-pointer ${dragClass}`}>
              <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center">
                <UploadCloud className="w-[18px] h-[18px] text-primary" />
              </div>
              <p className="text-[13px] font-medium text-foreground">拖放或点击上传简历</p>
              <p className="text-[11px] text-muted-foreground">纯文本 / Markdown / PDF / Word</p>
              {fileName && (
                <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-md bg-primary-container text-[11px] text-accent-foreground">
                  <FileText className="w-3 h-3" />{fileName}
                </span>
              )}
              <label htmlFor="resume-file-input-v2" className="cursor-pointer text-[11px] text-primary hover:underline mt-1">选择文件</label>
              <input id="resume-file-input-v2" type="file" accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFileInputChange} className="hidden" />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">简历内容</p>
              <Textarea rows={4} value={rawText} onChange={(e) => { setRawText(e.target.value); reset(); }}
                placeholder="粘贴简历文本…" className="resize-y min-h-[60px] rounded-lg text-[13px]" />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">JD 内容</p>
              <Textarea rows={4} value={jdText} onChange={(e) => { setJdText(e.target.value); reset(); }}
                placeholder="粘贴 JD 文本…" className="resize-y min-h-[60px] rounded-lg text-[13px]" />
            </div>

            {error && (
              <div role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>
            )}

            {state === 'analyzing' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">分析中…</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}

            <Button onClick={() => { void onAnalyze(); }} disabled={!hasInput || state === 'analyzing'}
              className="w-full h-11 rounded-lg text-[13px] font-semibold" size="lg">
              {state === 'analyzing' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSearch className="w-4 h-4 mr-1.5" />}
              {state === 'analyzing' ? '分析中…' : '开始分析'}
            </Button>
            {!hasInput && <p className="text-[10px] text-muted-foreground text-center -mt-2">请填写简历和 JD 内容后开始分析</p>}
          </div>
        </aside>

        {/* Right Panel */}
        <main className="flex-1 overflow-hidden bg-background">
          {state === 'idle' && <EmptyState icon={<FileSearch className="w-7 h-7 text-primary" />} title="简历分析工作台" desc="在左侧面板上传简历和 JD，查看解析结果、诊断报告和匹配度分析" />}
          {state === 'analyzing' && <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
            <h2 className="text-base font-semibold text-foreground mb-1">正在分析</h2>
            <p className="text-sm text-muted-foreground">正在解析简历和 JD，运行诊断分析…</p>
          </div>}
          {state === 'error' && <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4"><AlertCircle className="w-7 h-7 text-red-500" /></div>
            <h2 className="text-base font-semibold text-foreground mb-1">分析失败</h2>
            <p className="text-sm text-muted-foreground max-w-[320px] mb-4">{error}</p>
            <Button variant="outline" onClick={reset}>重试</Button>
          </div>}

          {state === 'done' && resume && (
            <Tabs defaultValue="compare" className="h-full flex flex-col">
              <div className="px-4 pt-4 border-b border-border shrink-0">
                <TabsList className="h-8">
                  <TabsTrigger value="compare" className="text-[11px] gap-1 px-2.5"><Eye className="w-3 h-3" />对比视图</TabsTrigger>
                  <TabsTrigger value="diagnostics" className="text-[11px] gap-1 px-2.5">
                    <ClipboardCheck className="w-3 h-3" />诊断
                    {diagnostics && diagnostics.summary.total > 0 && (
                      <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-medium rounded-full bg-red-100 text-red-700">{diagnostics.summary.total}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="jd" className="text-[11px] gap-1 px-2.5" disabled={!jd}><Target className="w-3 h-3" />JD</TabsTrigger>
                  <TabsTrigger value="match" className="text-[11px] gap-1 px-2.5" disabled={!matchReport || !atsResult}><BarChart3 className="w-3 h-3" />匹配度</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="compare" className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                <ResumeRawCompare rawText={rawText} resume={resume} />
              </TabsContent>
              <TabsContent value="diagnostics" className="flex-1 overflow-auto p-5 data-[state=inactive]:hidden">
                {diagnostics ? <DiagnosticsPanel diagnostics={diagnostics} /> : <p className="text-[12px] text-muted-foreground">诊断数据不可用</p>}
              </TabsContent>
              <TabsContent value="jd" className="flex-1 overflow-auto p-5 data-[state=inactive]:hidden">
                {jd ? <JdCard jd={jd} /> : <p className="text-[12px] text-muted-foreground">JD 数据不可用</p>}
              </TabsContent>
              <TabsContent value="match" className="flex-1 overflow-auto p-5 data-[state=inactive]:hidden">
                {matchReport && atsResult ? <MatchGauge matchReport={matchReport} atsResult={atsResult} /> : <p className="text-[12px] text-muted-foreground">匹配度数据不可用</p>}
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center mb-4">{icon}</div>
      <h2 className="text-base font-semibold text-foreground mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-[320px]">{desc}</p>
    </div>
  );
}
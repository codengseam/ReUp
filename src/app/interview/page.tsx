'use client';

import { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TranscriptUpload from '@/components/shared/interview/TranscriptUpload';
import TranscriptList from '@/components/shared/interview/TranscriptList';
import AnalysisView from '@/components/shared/interview/AnalysisView';
import InterviewChat from '@/components/shared/interview/InterviewChat';
import { safeTrack } from '@/shared/utils/analytics-helpers';
import type { InterviewTranscript as ParserTranscript } from '@/features/interview/transcript';
import type { InterviewTranscript as UploadTranscript } from '@/shared/types/interview';

// Cast between the two existing Transcript shapes. The upload API actually
// returns the parser.ts shape; TranscriptUpload's declared prop type is the
// shared/types/interview.ts shape. The cast stays in the page boundary so
// downstream code can rely on a single canonical type.
function asParserTranscript(t: UploadTranscript): ParserTranscript {
  return t as unknown as ParserTranscript;
}

export default function InterviewPage() {
  const [transcripts, setTranscripts] = useState<ParserTranscript[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await fetch('/api/interview/transcript/list', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.transcripts)) {
        setTranscripts(data.transcripts);
      } else {
        setTranscripts([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载面经列表失败';
      setListError(message);
      safeTrack({
        type: 'error',
        data: {
          message,
          stack: err instanceof Error ? err.stack ?? undefined : undefined,
        },
      });
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'transcripts') {
      void refreshList();
    }
  }, [activeTab, refreshList]);

  useEffect(() => {
    safeTrack({ type: 'page_view', page: '/interview' });
  }, []);

  const handleUploaded = useCallback((transcript: UploadTranscript) => {
    setTranscripts((prev) => [asParserTranscript(transcript), ...prev]);
    setActiveTab('transcripts');
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/interview/transcript/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        throw new Error(`HTTP ${res.status}`);
      }
      setTranscripts((prev) => prev.filter((t) => t.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      setListError(message);
      safeTrack({
        type: 'error',
        data: {
          message,
          stack: err instanceof Error ? err.stack ?? undefined : undefined,
        },
      });
    }
  }, [selectedId]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const selectedTranscript = selectedId
    ? transcripts.find((t) => t.id === selectedId) ?? null
    : null;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="chat">模拟面试</TabsTrigger>
          <TabsTrigger value="upload">上传面经</TabsTrigger>
          <TabsTrigger value="transcripts">我的面经</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-6">
          <InterviewChat />
        </TabsContent>

        <TabsContent value="upload" className="mt-6">
          <div className="space-y-4 max-w-2xl mx-auto">
            <TranscriptUpload onTranscriptReady={handleUploaded} />
            <p className="text-xs text-muted-foreground text-center">
              上传成功后会自动跳转到「我的面经」标签，可以在那里查看和分析。
            </p>
          </div>
        </TabsContent>

        <TabsContent value="transcripts" className="mt-6">
          {selectedTranscript ? (
            <AnalysisView
              transcript={selectedTranscript}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              <TranscriptList
                transcripts={transcripts}
                onSelect={handleSelect}
                onDelete={handleDelete}
                loading={listLoading}
                error={listError}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

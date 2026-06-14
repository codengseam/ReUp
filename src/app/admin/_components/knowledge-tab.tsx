'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Trash2, FileText, RefreshCw, Plus, Database, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface DocItem {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  category?: string;
  tags?: string[];
  skillName?: string;
  uploadTime?: string;
}

interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string;
}

export default function KnowledgeTab() {
  const [baseId, setBaseId] = useState('');
  const [baseName, setBaseName] = useState('');
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  // 知识库自动发现
  const [kbList, setKbList] = useState<KnowledgeBaseItem[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [showCreateKb, setShowCreateKb] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDesc, setNewKbDesc] = useState('');
  const [creatingKb, setCreatingKb] = useState(false);

  const [tags, setTags] = useState('');
  const [category, setCategory] = useState<'promotion' | 'interview' | 'general'>('general');
  const [skillName, setSkillName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // 初始化：从服务端加载知识库 ID
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/config?key=knowledge');
        if (res.ok) {
          const data = await res.json();
          if (data.knowledgeBaseId) {
            setBaseId(data.knowledgeBaseId);
            setBaseName(data.knowledgeBaseName || '');
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // 获取知识库列表
  const fetchKbList = useCallback(async () => {
    setKbLoading(true);
    try {
      const res = await fetch('/api/admin/config?action=list-kb', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setKbList(data.knowledgeBases || []);
      } else {
        toast.error(data.error || '获取知识库列表失败');
      }
    } catch {
      toast.error('获取知识库列表失败');
    } finally {
      setKbLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKbList();
  }, [fetchKbList]);

  // 创建知识库
  const handleCreateKb = async () => {
    if (!newKbName.trim()) return;
    setCreatingKb(true);
    try {
      const res = await fetch('/api/admin/config?action=create-kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKbName.trim(), description: newKbDesc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');

      setBaseId(data.knowledgeBase.id);
      setBaseName(data.knowledgeBase.name);
      setNewKbName('');
      setNewKbDesc('');
      setShowCreateKb(false);
      toast.success(`知识库 "${data.knowledgeBase.name}" 创建成功`);
      await fetchKbList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreatingKb(false);
    }
  };

  // 选择已有知识库
  const handleSelectKb = async (id: string) => {
    const kb = kbList.find(k => k.id === id);
    setBaseId(id);
    setBaseName(kb?.name || '');
    // 持久化到服务端
    try {
      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'knowledge',
          value: { knowledgeBaseId: id, knowledgeBaseName: kb?.name || '' },
        }),
      });
    } catch { /* ignore */ }
  };

  const fetchDocs = useCallback(async () => {
    if (!baseId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/documents/list?baseId=${encodeURIComponent(baseId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取文档列表失败');

      let localMeta: Record<string, { uploadTime?: string }> = {};
      try {
        const raw = localStorage.getItem('boss_doc_local_meta');
        if (raw) localMeta = JSON.parse(raw);
      } catch { /* ignore */ }

      const merged: DocItem[] = (data.documents || []).map((d: { id: string; name: string; status?: string; metadata?: { category?: string; tags?: string[]; skillName?: string } }) => ({
        id: d.id,
        name: d.name,
        status: d.status || 'processing',
        category: d.metadata?.category,
        tags: d.metadata?.tags,
        skillName: d.metadata?.skillName,
        uploadTime: localMeta[d.id]?.uploadTime,
      }));
      setDocs(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取文档列表失败');
    } finally {
      setLoading(false);
    }
  }, [baseId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0 || !baseId) return;
    const file = files[0];
    const allowed = ['.md', '.pdf', '.txt', '.docx'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      toast.error('仅支持 .md, .pdf, .txt, .docx 文件');
      return;
    }

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('baseId', baseId);
      formData.append(
        'metadata',
        JSON.stringify({
          tags: tags
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean),
          category,
          skillName: skillName || undefined,
        })
      );

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');

      try {
        const raw = localStorage.getItem('boss_doc_local_meta');
        const localMeta = raw ? JSON.parse(raw) : {};
        localMeta[data.docId] = {
          uploadTime: new Date().toLocaleString('zh-CN'),
        };
        localStorage.setItem('boss_doc_local_meta', JSON.stringify(localMeta));
      } catch { /* ignore */ }

      toast.success('上传成功，文档将自动向量化');
      await fetchDocs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;
    if (!baseId) return;
    try {
      const res = await fetch('/api/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseId, docId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success('删除成功');
      await fetchDocs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败';
      setError(msg);
      toast.error(msg);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default">成功</Badge>;
      case 'failed':
        return <Badge variant="destructive">失败</Badge>;
      case 'processing':
        return <Badge variant="secondary">处理中</Badge>;
      default:
        return <Badge variant="outline">待处理</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 知识库选择/创建 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>知识库配置</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchKbList}
              disabled={kbLoading}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${kbLoading ? 'animate-spin' : ''}`} />
              刷新列表
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateKb(!showCreateKb)}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              新建知识库
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 选择已有知识库 */}
          <div>
            <Label>选择知识库</Label>
            <Select value={baseId} onValueChange={handleSelectKb}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择已有知识库或新建...">
                  {baseId && baseName ? (
                    <span className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5" />
                      {baseName}
                    </span>
                  ) : (
                    '选择已有知识库或新建...'
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {kbList.length === 0 && !kbLoading && (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    暂无知识库，请新建
                  </div>
                )}
                {kbList.map((kb) => (
                  <SelectItem key={kb.id} value={kb.id}>
                    <span className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-muted-foreground" />
                      {kb.name}
                      {kb.description && (
                        <span className="text-xs text-muted-foreground ml-2">
                          - {kb.description}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {baseId && (
              <p className="text-xs text-muted-foreground mt-1">
                知识库 ID: {baseId}
              </p>
            )}
          </div>

          {/* 新建知识库表单 */}
          {showCreateKb && (
            <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
              <h4 className="text-sm font-medium">新建知识库</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>名称 *</Label>
                  <Input
                    value={newKbName}
                    onChange={(e) => setNewKbName(e.target.value)}
                    placeholder="如：ReUp 知识库"
                  />
                </div>
                <div>
                  <Label>描述（可选）</Label>
                  <Input
                    value={newKbDesc}
                    onChange={(e) => setNewKbDesc(e.target.value)}
                    placeholder="如：晋升面试知识库"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleCreateKb}
                  disabled={creatingKb || !newKbName.trim()}
                  className="gap-1.5"
                >
                  {creatingKb ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />创建中...</>
                  ) : (
                    <><Check className="w-3.5 h-3.5" />创建</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowCreateKb(false);
                    setNewKbName('');
                    setNewKbDesc('');
                  }}
                >
                  取消
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                通过 Coze API 创建知识库，创建后自动关联到当前项目。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 上传区域 */}
      {baseId && (
        <Card>
          <CardHeader>
            <CardTitle>上传文档</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                {error}
              </div>
            )}

            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFileSelect(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                点击或拖拽上传文件（.md / .pdf / .txt / .docx）
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                上传后自动分块并向量化，无需手动处理
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.pdf,.txt,.docx"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>

            {/* Metadata form */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>标签（用逗号分隔）</Label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="如：晋升,面试"
                />
              </div>
              <div>
                <Label>分类</Label>
                <Select
                  value={category}
                  onValueChange={(v: 'promotion' | 'interview' | 'general') =>
                    setCategory(v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">通用</SelectItem>
                    <SelectItem value="promotion">晋升类</SelectItem>
                    <SelectItem value="interview">面试类</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Skill 关联</Label>
                <Select value={skillName || "none"} onValueChange={(v) => setSkillName(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Skill（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不关联</SelectItem>
                    <SelectItem value="jinsheng-dicing-luoji">晋升底层逻辑</SelectItem>
                    <SelectItem value="jinsheng-san-yuanze">晋升三大原则</SelectItem>
                    <SelectItem value="nengli-sanzhong-jingjie">能力三重境界</SelectItem>
                    <SelectItem value="p8-lingyu-zhuanjia">领域专家演进</SelectItem>
                    <SelectItem value="competency-model-alignment">素质模型对齐</SelectItem>
                    <SelectItem value="highlight-extractor">亮点挖掘</SelectItem>
                    <SelectItem value="blind-spot-navigation">盲区导航</SelectItem>
                    <SelectItem value="reverse-questioning-framework">反问框架</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Document list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">文档列表</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchDocs}
                  disabled={loading}
                  className="gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>文件名</TableHead>
                      <TableHead>分类</TableHead>
                      <TableHead>标签</TableHead>
                      <TableHead>Skill</TableHead>
                      <TableHead>上传时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-muted-foreground py-8"
                        >
                          {loading ? '加载中...' : '暂无文档，请上传'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      docs.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              {doc.name}
                            </span>
                          </TableCell>
                          <TableCell>{doc.category || '-'}</TableCell>
                          <TableCell>
                            {doc.tags && doc.tags.length > 0
                              ? doc.tags.map((t) => (
                                  <Badge
                                    key={t}
                                    variant="outline"
                                    className="mr-1"
                                  >
                                    {t}
                                  </Badge>
                                ))
                              : '-'}
                          </TableCell>
                          <TableCell>{doc.skillName || '-'}</TableCell>
                          <TableCell>{doc.uploadTime || '-'}</TableCell>
                          <TableCell>{statusBadge(doc.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(doc.id)}
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

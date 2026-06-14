'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Briefcase, Menu, X, Settings, ChevronRight,
  Search, Lightbulb, Trash2
} from 'lucide-react';
import type { Message, CitationData, ModelConfig, CustomProvider } from '@/components/chat/types';
import {
  AVAILABLE_MODELS, PROVIDER_TEMPLATES, SKILLS,
  INPUT_SUGGESTIONS_DB
} from '@/components/chat/types';
import { correctTypos } from '@/lib/typo-correction';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatInput from '@/components/chat/ChatInput';
import WelcomeScreen from '@/components/chat/WelcomeScreen';
import CitationDrawer from '@/components/chat/CitationDrawer';
import { ConversationSidebar } from '@/components/chat/ConversationSidebar';
import {
  getConversations,
  getCurrentConversation,
  createConversation,
  addMessageToConversation,
  updateConversationMessages,
  deleteConversation,
  clearConversationMessages,
  setCurrentConversation,
  type Conversation,
} from '@/lib/conversation-store';
import { Button } from '@/components/ui/button';
import { classifyError } from '@/lib/error-classifier';
import { recordFeedback } from '@/lib/feedback-store';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ========== 语音识别辅助函数 ==========
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
  recognition.continuous = false;
  return recognition;
}

// sessionStorage key 已废弃：对话数据由 conversation-store 写入 localStorage

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // 从当前对话派生出 messages
  const messages = useMemo(() => {
    const conv = conversations.find(c => c.id === currentConversationId);
    return conv?.messages ?? [];
  }, [conversations, currentConversationId]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeCitation, setActiveCitation] = useState<CitationData | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(AVAILABLE_MODELS[0]);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [adminDefaultLabel, setAdminDefaultLabel] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState({ providerType: 'openai', endpoint: '', apiKey: '', modelId: '', name: '' });
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [thumbsDownCount, setThumbsDownCount] = useState<number>(0); // 保留字段名（ChatMessage 仍按此读取）；语义现为"反馈总数"
  const [regenerateCount, setRegenerateCount] = useState<number>(0);
  const [expandedExamples, setExpandedExamples] = useState<Record<string, boolean>>({});

  // 客户端水合后从 localStorage 同步模型配置，避免 SSR 水合不匹配
  useEffect(() => {
    const getCustomProviders = (): CustomProvider[] => {
      try {
        const user = JSON.parse(localStorage.getItem('boss_custom_providers') || '[]') as CustomProvider[];
        const admin = JSON.parse(localStorage.getItem('boss_admin_custom_models') || '[]') as CustomProvider[];
        return [...user, ...admin];
      } catch { return []; }
    };

    // 恢复自定义模型列表
    const allCustom = getCustomProviders();
    if (allCustom.length > 0) {
      setCustomProviders(allCustom);
    }

    try {
      const saved = localStorage.getItem('boss_model_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        const found = AVAILABLE_MODELS.find(m => m.id === parsed.id);
        if (found) { setModelConfig(found); return; }
        const customFound = allCustom.find(c => c.id === parsed.id);
        if (customFound) {
          setModelConfig({
            id: customFound.id,
            name: customFound.name,
            description: `${customFound.providerType} · ${customFound.modelId}`,
            providerType: customFound.providerType,
            endpoint: customFound.endpoint,
            apiKey: customFound.apiKey,
            modelId: customFound.modelId,
          });
          return;
        }
      }
    } catch { /* ignore */ }
    try {
      const adminConfig = localStorage.getItem('boss_admin_model_config');
      if (adminConfig) {
        const parsed = JSON.parse(adminConfig);
        const found = AVAILABLE_MODELS.find(m => m.id === parsed.defaultModelId);
        if (found) {
          setModelConfig(found);
          setAdminDefaultLabel(found.name);
          return;
        }
        const customFound = allCustom.find(c => c.id === parsed.defaultModelId);
        if (customFound) {
          setModelConfig({
            id: customFound.id,
            name: customFound.name,
            description: `${customFound.providerType} · ${customFound.modelId}`,
            providerType: customFound.providerType,
            endpoint: customFound.endpoint,
            apiKey: customFound.apiKey,
            modelId: customFound.modelId,
          });
          setAdminDefaultLabel(customFound.name);
          return;
        }
      }
    } catch { /* ignore */ }
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestDurations = useRef<number[]>([]);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [pendingRegenerate, setPendingRegenerate] = useState<{ content: string; isRegenerating: boolean } | null>(null);

  // ===== 多对话：从 localStorage conversation-store 初始化 =====
  useEffect(() => {
    const convs = getConversations();
    const current = getCurrentConversation();
    if (convs.length === 0 || !current) {
      // 没有对话就自动新建一个
      const newConv = createConversation();
      setConversations([newConv]);
      setCurrentConversationId(newConv.id);
    } else {
      setConversations(convs);
      setCurrentConversationId(current.id);
    }
  }, []);

  // ===== 响应式：小屏幕自动折叠左侧栏 =====
  useEffect(() => {
    const handleResize = () => {
      setSidebarCollapsed(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 模型持久化：切换模型时同步写入 localStorage
  const updateModelConfig = useCallback((config: ModelConfig) => {
    setModelConfig(config);
    try {
      localStorage.setItem('boss_model_config', JSON.stringify(config));
    } catch { /* ignore */ }
  }, []);

  // 自定义模型：保存/删除
  const saveCustomProvider = useCallback(() => {
    if (!customForm.name || !customForm.endpoint || !customForm.apiKey || !customForm.modelId) return;
    const provider: CustomProvider = {
      id: `custom-${Date.now()}`,
      name: customForm.name,
      providerType: customForm.providerType,
      endpoint: customForm.endpoint,
      apiKey: customForm.apiKey,
      modelId: customForm.modelId,
    };
    const updated = [...customProviders, provider];
    setCustomProviders(updated);
    try { localStorage.setItem('boss_custom_providers', JSON.stringify(updated)); } catch { /* ignore */ }
    setShowCustomForm(false);
    setCustomForm({ providerType: 'openai', endpoint: '', apiKey: '', modelId: '', name: '' });
    setTestResult(null);
  }, [customForm, customProviders]);

  const deleteCustomProvider = useCallback((id: string) => {
    if (!confirm('确定要删除这个自定义模型吗？')) return;
    const updated = customProviders.filter(p => p.id !== id);
    setCustomProviders(updated);
    try { localStorage.setItem('boss_custom_providers', JSON.stringify(updated)); } catch { /* ignore */ }
    if (modelConfig.id === id) {
      updateModelConfig(AVAILABLE_MODELS[0]);
    }
  }, [customProviders, modelConfig.id, updateModelConfig]);

  // 连通性测试
  const testConnection = useCallback(async () => {
    if (!customForm.endpoint || !customForm.apiKey || !customForm.modelId) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: customForm.endpoint,
          apiKey: customForm.apiKey,
          modelId: customForm.modelId,
          providerType: customForm.providerType,
        }),
      });
      const data = await res.json();
      setTestResult({ success: data.success, message: data.success ? `连接成功，延迟 ${data.latency}ms` : (data.error || '连接失败') });
    } catch {
      setTestResult({ success: false, message: '网络请求失败，请检查 endpoint 地址' });
    } finally {
      setIsTesting(false);
    }
  }, [customForm]);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // 输入联想
  useEffect(() => {
    if (input.length >= 2) {
      const inputChars = [...input];
      const scored = INPUT_SUGGESTIONS_DB.map(s => {
        let score = 0;
        if (s.includes(input)) score += 10;
        const overlapCount = inputChars.filter(c => s.includes(c)).length;
        score += overlapCount * 2;
        const words = input.split(/[\s,，、]+/).filter(w => w.length > 0);
        for (const w of words) {
          if (s.includes(w)) score += 5;
        }
        return { text: s, score };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      setSuggestions(scored.map(x => x.text));
    } else {
      setSuggestions([]);
    }
  }, [input]);

  // ===== 语音识别 =====
  const toggleVoiceInput = useCallback(() => {
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
      const srEvent = event as unknown as { results: { [key: number]: { [index: number]: { transcript: string } } } };
      const transcript = Array.from({ length: Object.keys(srEvent.results).length }, (_, i) => srEvent.results[i]?.[0]?.transcript || '')
        .join('');
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [isListening]);

  // ===== 发送消息 =====
  // 同步 messages 到 conversation-store 的包装器（既支持函数也支持数组）
  // 注意：从 store 读最新值，避免连续调用时拿到陈旧的 messages
  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    if (!currentConversationId) return;
    const convs = getConversations();
    const conv = convs.find(c => c.id === currentConversationId);
    const prev = conv?.messages ?? [];
    const next = typeof updater === 'function' ? updater(prev) : updater;
    updateConversationMessages(currentConversationId, next);
    setConversations(getConversations());
  }, [currentConversationId]);

  const sendMessage = useCallback(async (messageText?: string, isRegenerating = false) => {
    const rawText = (messageText || input).trim();
    const text = correctTypos(rawText);
    if (!text || isLoading) return;

    const startTime = Date.now();
    setRegenerateCount(0);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 根据是否重新生成决定是否追加新的 user 消息
    // 重新生成时，user 消息已经在 messages 中，chatHistory 直接用 messages 即可
    let chatHistory: { role: string; content: string }[];
    if (isRegenerating) {
      chatHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
    } else {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        correctedFrom: text !== rawText ? rawText : undefined,
      };
      setMessages(prev => [...prev, userMessage]);
      chatHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));
    }

    setInput('');
    setSuggestions([]);
    setIsLoading(true);
    setStatus('understanding');

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      citations: [],
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: chatHistory,
          model: modelConfig.id,
          ...(modelConfig.providerType ? {
            customProvider: {
              providerType: modelConfig.providerType,
              endpoint: modelConfig.endpoint,
              apiKey: modelConfig.apiKey,
              modelId: modelConfig.modelId,
            }
          } : {}),
          ...(() => {
            try {
              const ragParamsRaw = localStorage.getItem('boss_admin_rag_params');
              const customPrompt = localStorage.getItem('boss_admin_prompt');
              return {
                ...(ragParamsRaw ? { ragParams: JSON.parse(ragParamsRaw) } : {}),
                ...(customPrompt ? { customPrompt } : {}),
              };
            } catch { return {}; }
          })(),
        }),
      });

      if (!response.ok) {
        // 尝试从响应体里提取更具体的错误信息
        let detail = `HTTP ${response.status}`;
        try {
          const text = await response.text();
          if (text) {
            // 优先尝试 JSON
            try {
              const json = JSON.parse(text);
              if (json?.error) detail = String(json.error);
              else if (json?.message) detail = String(json.message);
            } catch {
              // 非 JSON，直接用 text（限制长度）
              detail = text.substring(0, 200);
            }
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let buffer = '';
      let citationsData: CitationData[] = [];
      let strategyData: string | undefined;
      let confidenceData: 'high' | 'medium' | 'low' = 'high';
      let confidenceReasonData: string | undefined;
      let safetyWarningData: string | undefined;

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

            if (parsed.status) {
              setStatus(parsed.status);
            }

            if (parsed.meta) {
              citationsData = parsed.meta.citations || [];
              strategyData = parsed.meta.strategy;
            }

            if (parsed.content) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              );
            }

            if (parsed.confidence) {
              confidenceData = parsed.confidence;
              confidenceReasonData = parsed.confidenceReason;
            }

            if (parsed.safetyWarning) {
              safetyWarningData = parsed.safetyWarning;
            }

            if (parsed.transferToHuman) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, transferToHuman: true, transferReason: parsed.transferReason || '系统评估当前问题需要人工顾问介入' }
                    : m
                )
              );
            }
            if (parsed.hallucinationDetected) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, hallucinationDetected: true }
                    : m
                )
              );
            }

            if (parsed.thinkingStep) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        thinkingSteps: [...(m.thinkingSteps || []).filter(s => s.step !== parsed.thinkingStep.step), parsed.thinkingStep],
                      }
                    : m
                )
              );
            }

            if (parsed.error) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + `\n\n⚠️ ${parsed.error}` }
                    : m
                )
              );
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                citations: citationsData,
                strategy: strategyData,
                confidence: confidenceData,
                confidenceReason: confidenceReasonData,
                safetyWarning: safetyWarningData,
              }
            : m
        )
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // 用户主动中止：把刚插入的空 assistant 消息清掉
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }
      // 区分错误类型，给出对应提示
      const err = classifyError(error);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: '', error: err }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setStatus('');
      const elapsed = (Date.now() - startTime) / 1000;
      requestDurations.current.push(elapsed);
      if (requestDurations.current.length > 5) {
        requestDurations.current.shift();
      }
      const avg = requestDurations.current.reduce((a, b) => a + b, 0) / requestDurations.current.length;
      setEstimatedSeconds(Math.round(avg));
    }
  }, [input, isLoading, messages, modelConfig]);

  // 重新生成
  const regenerate = useCallback(() => {
    if (messages.length < 2) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    setRegenerateCount(prev => prev + 1);
    setMessages(prev => prev.slice(0, -1));
    // 传入 isRegenerating: true 跳过追加新 user 消息
    setPendingRegenerate({ content: lastUserMsg.content, isRegenerating: true });
  }, [messages]);

  // 重试：删除错误消息，重发上一条 user 消息
  const retry = useCallback((failedAssistantId: string) => {
    const convs = getConversations();
    const conv = convs.find(c => c.id === currentConversationId);
    if (!conv) return;
    const failedIdx = conv.messages.findIndex(m => m.id === failedAssistantId);
    if (failedIdx === -1) return;
    // 找前一条 user 消息作为重发内容
    const userMsg = [...conv.messages.slice(0, failedIdx)].reverse().find(m => m.role === 'user');
    if (!userMsg) return;
    // 删除失败的 assistant 消息
    setMessages(prev => prev.filter(m => m.id !== failedAssistantId));
    // 走 sendMessage 的 isRegenerating 路径：user 消息已经在 messages 中
    setPendingRegenerate({ content: userMsg.content, isRegenerating: true });
  }, [currentConversationId]);

  useEffect(() => {
    if (pendingRegenerate !== null) {
      sendMessage(pendingRegenerate.content, pendingRegenerate.isRegenerating);
      setPendingRegenerate(null);
    }
  }, [pendingRegenerate, sendMessage]);

  // 复制内容
  const fallbackCopyText = useCallback((text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch { /* silent */ }
    document.body.removeChild(textarea);
  }, []);

  const copyContent = useCallback((content: string, id: string) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(content).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }).catch(() => {
        fallbackCopyText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      });
    } else {
      fallbackCopyText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, [fallbackCopyText]);

  // 朗读
  const speakContent = useCallback((content: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(content.replace(/[#*>`[\]^]/g, ''));
      utterance.lang = 'zh-CN';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // 分享
  const shareContent = useCallback((content: string) => {
    if (navigator.share) {
      navigator.share({
        title: 'ReUp 职场顾问建议',
        text: content.substring(0, 200),
      }).catch(() => {});
    } else {
      fallbackCopyText(content);
      setCopiedId('share-fallback');
      setTimeout(() => setCopiedId(null), 1500);
    }
  }, [fallbackCopyText]);

  // 导出对话
  const exportConversation = useCallback(() => {
    if (messages.length === 0) return;
    const lines: string[] = ['📋 ReUp 对话记录'];
    for (const msg of messages) {
      lines.push('---');
      if (msg.role === 'user') {
        lines.push(`🧑 用户：${msg.content}`);
      } else {
        lines.push(`🤖 AI：${msg.content}`);
      }
    }
    const text = lines.join('\n');
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    } else {
      fallbackCopyText(text);
    }
    setCopiedId('export');
    setTimeout(() => setCopiedId(null), 2000);
  }, [messages, fallbackCopyText]);

  // 清空对话
  const clearMessages = useCallback(() => {
    if (!currentConversationId) return;
    clearConversationMessages(currentConversationId);
    setConversations(getConversations());
    setActiveCitation(null);
    setThumbsDownCount(0);
    setRegenerateCount(0);
  }, [currentConversationId]);

  // 处理快捷按钮
  const handleQuickEntry = useCallback((query: string) => {
    sendMessage(query);
  }, [sendMessage]);

  // 事件委托：引文角标点击处理
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 兼容 ChatMessage.tsx 阶段 4 新格式（<sup><button class="citation-ref" data-citation="N">）
      // 与可能的旧 sup.citation-ref 元素（data-citation-id / data-cite-id）
      const ref = target.closest('.citation-ref') as HTMLElement | null;
      if (ref) {
        const raw = ref.dataset.citation ?? ref.dataset.citationId ?? ref.dataset.citeId ?? '0';
        const citationId = parseInt(raw, 10);
        const msgId = ref.dataset.messageId ?? ref.dataset.msgId;
        if (msgId) {
          const message = messages.find(m => m.id === msgId);
          if (message?.citations) {
            const citation = message.citations.find(c => c.id === citationId);
            if (citation) setActiveCitation(citation);
          }
        }
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [messages]);

  // 状态文字映射
  const statusText: Record<string, string> = {
    understanding: '正在理解问题...',
    searching: '正在检索知识库...',
    generating: '正在生成答案...',
  };

  const statusIcon: Record<string, React.ReactNode> = {
    understanding: <Search className="w-3.5 h-3.5 animate-pulse" />,
    searching: <Search className="w-3.5 h-3.5 animate-pulse" />,
    generating: <Lightbulb className="w-3.5 h-3.5 animate-pulse" />,
  };

  return (
    <div className="h-screen flex bg-background">
      {/* ===== 多对话管理侧边栏 ===== */}
      <ConversationSidebar
        conversations={conversations}
        currentId={currentConversationId}
        onNewChat={() => {
          const conv = createConversation();
          setConversations(getConversations());
          setCurrentConversationId(conv.id);
        }}
        onSelectChat={(id) => {
          setCurrentConversationId(id);
          setCurrentConversation(id);
          setActiveCitation(null);
        }}
        onDeleteChat={(id) => {
          deleteConversation(id);
          setConversations(getConversations());
          const current = getCurrentConversation();
          setCurrentConversationId(current?.id ?? null);
        }}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* ===== 侧滑面板 ===== */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
        <div
          className={`absolute right-0 top-0 h-full w-80 bg-background shadow-xl transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            {/* 头部 */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Skills & 设置</h2>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Skills列表 */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">晋升类</h3>
              {SKILLS.filter(s => s.category === '晋升类').map(skill => (
                <button
                  key={skill.name}
                  onClick={() => { handleQuickEntry(skill.trigger); setSidebarOpen(false); }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center gap-3 mb-1"
                >
                  <span className="text-lg">{skill.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-foreground">{skill.name}</div>
                    <div className="text-xs text-muted-foreground">{skill.trigger.substring(0, 20)}...</div>
                  </div>
                </button>
              ))}

              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 mt-4">面试类</h3>
              {SKILLS.filter(s => s.category === '面试类').map(skill => (
                <button
                  key={skill.name}
                  onClick={() => { handleQuickEntry(skill.trigger); setSidebarOpen(false); }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center gap-3 mb-1"
                >
                  <span className="text-lg">{skill.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-foreground">{skill.name}</div>
                    <div className="text-xs text-muted-foreground">{skill.trigger.substring(0, 20)}...</div>
                  </div>
                </button>
              ))}

              {/* 模型配置 */}
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 mt-6">模型设置</h3>
              {adminDefaultLabel && (
                <div className="mb-2 text-[10px] text-muted-foreground/60">
                  管理员默认：{adminDefaultLabel}
                </div>
              )}
              <button
                onClick={() => setShowModelConfig(!showModelConfig)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">模型配置</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{modelConfig.name}</span>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showModelConfig ? 'rotate-90' : ''}`} />
                </div>
              </button>

              {showModelConfig && (
                <div className="mt-2 ml-7 space-y-1">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">内置模型</p>
                  {AVAILABLE_MODELS.map(model => (
                    <button
                      key={model.id}
                      onClick={() => updateModelConfig(model)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        modelConfig.id === model.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="font-medium">{model.name}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">{model.description}</div>
                    </button>
                  ))}

                  {customProviders.length > 0 && (
                    <>
                      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1 mt-3">自定义模型</p>
                      {customProviders.map(provider => (
                        <div key={provider.id} className="flex items-center gap-1">
                          <button
                            onClick={() => updateModelConfig({
                              id: provider.id,
                              name: provider.name,
                              description: `${provider.providerType} · ${provider.modelId}`,
                              providerType: provider.providerType,
                              endpoint: provider.endpoint,
                              apiKey: provider.apiKey,
                              modelId: provider.modelId,
                            })}
                            className={`flex-1 text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                              modelConfig.id === provider.id
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-muted text-muted-foreground'
                            }`}
                          >
                            <div className="font-medium">{provider.name}</div>
                            <div className="text-[10px] opacity-70 mt-0.5">{provider.providerType} · {provider.modelId}</div>
                          </button>
                          <button
                            onClick={() => deleteCustomProvider(provider.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                            title="删除"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  <button
                    onClick={() => setShowCustomForm(!showCustomForm)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2 mt-2"
                  >
                    <span className="text-base leading-none">+</span> 添加自定义模型
                  </button>

                  {showCustomForm && (
                    <div className="mt-2 space-y-2 p-3 rounded-lg bg-muted/50">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">提供商</label>
                        <select
                          value={customForm.providerType}
                          onChange={e => {
                            const tpl = PROVIDER_TEMPLATES.find(t => t.type === e.target.value);
                            setCustomForm(prev => ({ ...prev, providerType: e.target.value, endpoint: tpl?.endpoint || '' }));
                          }}
                          className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
                        >
                          {PROVIDER_TEMPLATES.map(t => (
                            <option key={t.type} value={t.type}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">模型名称</label>
                        <input
                          type="text"
                          value={customForm.name}
                          onChange={e => setCustomForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="如：我的智谱模型"
                          className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Endpoint</label>
                        <input
                          type="text"
                          value={customForm.endpoint}
                          onChange={e => setCustomForm(prev => ({ ...prev, endpoint: e.target.value }))}
                          placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                          className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          填写 Base URL 即可，系统自动补全路径。如：https://api.openai.com/v1
                        </p>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">API Key</label>
                        <input
                          type="password"
                          value={customForm.apiKey}
                          onChange={e => setCustomForm(prev => ({ ...prev, apiKey: e.target.value }))}
                          placeholder="sk-..."
                          className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
                        />
                        <p className="text-[10px] text-amber-600 mt-1">
                          API Key 将存储在浏览器本地，请勿在公共电脑上使用。
                        </p>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Model ID</label>
                        <input
                          type="text"
                          value={customForm.modelId}
                          onChange={e => setCustomForm(prev => ({ ...prev, modelId: e.target.value }))}
                          placeholder="glm-4-flash"
                          className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={testConnection}
                          disabled={isTesting || !customForm.endpoint || !customForm.apiKey || !customForm.modelId}
                          className="flex-1 px-3 py-1.5 rounded text-xs border border-border hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isTesting ? '测试中...' : '测试连接'}
                        </button>
                        <button
                          onClick={saveCustomProvider}
                          disabled={!customForm.name || !customForm.endpoint || !customForm.apiKey || !customForm.modelId}
                          className="flex-1 px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          保存
                        </button>
                      </div>

                      {testResult && (
                        <div className={`text-xs px-2 py-1.5 rounded ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {testResult.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 导出对话 & 清空对话 */}
            <div className="p-4 border-t border-border space-y-2">
              <button
                onClick={exportConversation}
                disabled={messages.length === 0}
                className="w-full px-4 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copiedId === 'export' ? '已复制到剪贴板' : '导出对话'}
              </button>
              <button
                onClick={() => {
                  if (window.confirm('确定要清空当前对话吗？')) {
                    clearMessages();
                  }
                }}
                className="w-full px-4 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm text-muted-foreground"
              >
                清空对话
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 引文溯源侧边栏 ===== */}
      {activeCitation && (
        <CitationDrawer
          citation={activeCitation}
          onClose={() => setActiveCitation(null)}
        />
      )}

      {/* ===== 主内容区 ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-tight">ReUp</h1>
              <p className="text-[10px] text-muted-foreground">职场晋升与面试顾问</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{modelConfig.name}</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" />
                  清空
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认清空对话？</AlertDialogTitle>
                  <AlertDialogDescription>此操作将删除当前对话的所有消息，无法撤销。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={clearMessages} className="bg-destructive text-destructive-foreground">
                    确认清空
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* 消息区 */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[680px] mx-auto px-6 py-6">
            {/* 欢迎态 */}
            {messages.length === 0 && !isLoading && (
              <WelcomeScreen
                onQuickEntry={handleQuickEntry}
                expandedExamples={expandedExamples}
                onToggleExample={(key) => setExpandedExamples(prev => ({ ...prev, [key]: !prev[key] }))}
              />
            )}

            {/* 对话消息：跳过空 assistant 消息（loading 态由独立 indicator 渲染，避免重复 AI 头像） */}
            {messages.map((message, idx) => {
              const isEmptyAssistantLoading =
                message.role === 'assistant' &&
                !message.content &&
                !message.thinkingSteps?.length &&
                !message.error &&
                isLoading &&
                idx === messages.length - 1;
              if (isEmptyAssistantLoading) return null;
              // 找前一条 user 消息作为 query 上下文（反馈持久化用）
              const prevUserMsg = [...messages.slice(0, idx)].reverse().find(m => m.role === 'user');
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLoading={isLoading}
                  isLastMessage={idx === messages.length - 1}
                  status={status}
                  copiedId={copiedId}
                  thumbsDownCount={thumbsDownCount}
                  regenerateCount={regenerateCount}
                  onRegenerate={regenerate}
                  onRetry={retry}
                  onCopy={copyContent}
                  onSpeak={speakContent}
                  onShare={shareContent}
                  onCitationClick={(citation) => setActiveCitation(citation)}
                  onThumbsDown={async () => {
                    setThumbsDownCount(prev => prev + 1);
                    // 反馈持久化：失败隔离（不影响主流程，UI 仍显示已记录）
                    // 走 /api/feedback 是为了避免把 server-only 的 feedback-store 拉到客户端 bundle
                    try {
                      await fetch('/api/feedback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          messageId: message.id,
                          conversationId: currentConversationId ?? '',
                          reason: 'unhelpful',
                          query: prevUserMsg?.content ?? '',
                          response: message.content,
                        }),
                      });
                    } catch (err) {
                      console.warn('[feedback] record failed:', err);
                    }
                  }}
                />
              );
            })}

            {/* 状态指示器 */}
            {isLoading && status && (
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0 mr-3">
                  <Briefcase className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-muted">
                  {statusIcon[status]}
                  <span className="text-sm text-muted-foreground">
                    {statusText[status]}
                    {estimatedSeconds !== null && (
                      <span className="text-xs opacity-60 ml-1">预计 {estimatedSeconds}s</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* 输入区域 */}
        <ChatInput
          input={input}
          isLoading={isLoading}
          isListening={isListening}
          suggestions={suggestions}
          estimatedSeconds={estimatedSeconds}
          modelName={modelConfig.name}
          onInputChange={setInput}
          onSend={() => sendMessage()}
          onToggleVoice={toggleVoiceInput}
          onSuggestionClick={(suggestion) => { setInput(suggestion); setSuggestions([]); }}
        />
      </div>
    </div>
  );
}
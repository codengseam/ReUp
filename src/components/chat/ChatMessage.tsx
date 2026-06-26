'use client';

import React, { useState, useEffect } from 'react';
import {
  Briefcase, Search, BookOpen, Lightbulb, MessageCircle,
  RotateCcw, Volume2, Copy, Share2, Quote, AlertTriangle, Check,
  ThumbsDown, UserRound, Brain, ChevronDown, ChevronRight, AlertCircle, RefreshCw
} from 'lucide-react';
import DOMPurify from 'dompurify';
import type { Message, CitationData, ThinkingStep } from './types';

// ========== ThinkingPanel 组件 ==========
function ThinkingPanel({ steps, streamStatus }: { steps: ThinkingStep[]; streamStatus?: string }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (streamStatus === 'generating') {
      setIsCollapsed(true);
    }
  }, [streamStatus]);

  const toggleAll = () => setIsCollapsed(prev => !prev);
  const toggleStep = (step: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  if (!steps || steps.length === 0) return null;

  const sortedSteps = [...steps].sort((a, b) => a.step - b.step);

  return (
    <div className="mb-4 border border-[#e8e8e8] rounded-2xl p-6 bg-white">
      <button
        type="button"
        onClick={toggleAll}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground">正在思考</span>
          <span className="text-xs text-muted-foreground">({steps.length} 步)</span>
        </div>
        <span className="text-xs text-primary hover:underline">
          {isCollapsed ? '展开所有' : '收起所有'}
        </span>
      </button>

      {!isCollapsed && (
        <div className="relative mt-3 pl-1">
          {/* 纵向连接线 */}
          <div className="absolute left-[13px] top-2 bottom-2 w-px bg-border" aria-hidden />
          {sortedSteps.map((s) => (
            <div key={s.step} className="relative flex gap-3 pb-3.5 last:pb-0">
              {/* 时间线节点 */}
              <div
                className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ring-4 ring-surface-container transition-colors ${
                  s.status === 'completed'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-container border-2 border-primary text-primary animate-pulse'
                }`}
              >
                {s.status === 'completed' ? <Check className="w-3.5 h-3.5" /> : s.step}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <button
                  type="button"
                  onClick={() => toggleStep(s.step)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{s.title}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${expandedSteps.has(s.step) ? 'rotate-180' : ''}`} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.description}</p>
                </button>
                {expandedSteps.has(s.step) && s.details && (
                  <div className="mt-1.5 text-xs text-muted-foreground leading-snug bg-background/60 rounded-md px-2.5 py-1.5">
                    {s.details}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== 格式化Markdown ==========
export function formatMarkdown(
  text: string,
  purify: { sanitize: (dirty: string, config?: Record<string, unknown>) => string } | null,
  messageId?: string,
  citations?: CitationData[]
): string {
  // Skill key 映射：英文 key → 中文名（用于在回复中展示中文 Skill 名）
  const SKILL_KEY_MAP: Record<string, string> = {
    'p8-lingyu-zhuanjia': '领域专家演进',
    'jinsheng-diceng-luoji': '晋升底层逻辑',
    'jinsheng-sanda-yuanze': '晋升三大原则',
    'nengli-sanzhong-jingjie': '能力三重境界',
  };

  let html = text;
  // 1. 去除整行单独的 # 字符（LLM 偶发作为分隔符，避免独立显示在页面上）
  html = html.replace(/^\s*#+\s*$/gm, '');
  // 2. 去除 Markdown 标题前缀（# ~ ###### + 空格 + 标题文本）
  html = html.replace(/^#{1,6}\s+/gm, '');
  // 2.5. 清洗原文引用中的作者/书名（blockquote 行首带书名/作者的情况）
  // 形式: > 《书名》, 作者。content  或  > — 李运华,《书名》。content
  // 注意：作者/书名前的内容用 [\u4e00-\u9fa5·\s,，]{0,15}? 限定，避免误吃正文
  html = html.replace(
    /^(>\s*)[—\-]?\s*[\u4e00-\u9fa5·\s,，]{0,15}?《[^》]+》\s*[,，]?\s*[^\n。]*[。]?/gm,
    '$1'
  );
  // 2.6. 去除以破折号引导的书名引用（行内/任意位置，最常见的尾巴格式）
  // 形式: —— 《书名》, —— 作者《书名》, —— 作者,《书名》
  html = html.replace(
    /[—\-]{1,2}\s*[\u4e00-\u9fa5·\s,，]{0,10}?《[^》]+》[。,，]?/g,
    ''
  );
  // 2.7. 去除行末独立的《书名》（无破折号引导，前面可能跟句号、逗号、空格）
  html = html.replace(
    /[\s,，。]+《[^》]+》\s*[。,，]?$/gm,
    ''
  );
  // 2.8. 清理行末残留的孤立破折号
  html = html.replace(/\s*[—\-]{1,2}\s*$/gm, '');
  // 2.9. 清理行末空白
  html = html.replace(/[ \t]+$/gm, '');
  // 3. 压缩所有连续空行为单个换行，避免渲染出多余空行
  html = html.replace(/\n{2,}/g, '\n');
  // 3.1. 调用的 Skill 标签：必须在加粗替换之前处理，否则 **调用的 Skill** 会被转成 strong
  html = html.replace(/\*\*调用的 Skill\*\*:\s*(.+)/g, '<span class="inline-flex items-center px-3 py-1 rounded-full bg-primary-container text-primary text-xs font-medium border border-[#d1fae5]">$1</span>');
  // 3.2. 原文知识点标签（末尾追加换行，确保后续 > 引用能在行首被 blockquote 正则匹配）
  html = html.replace(/\*\*原文知识点\*\*:\s*/g, '<div class="text-xs text-muted-foreground font-medium mt-2.5 mb-1">原文知识点</div>\n');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>');
  // 引用块：方案 A - Claude 简约优雅风（bg-[#f6fef9] 清新底色）
  html = html.replace(/^>\s*(.+)$/gm, '<blockquote class="border-l-[3px] border-primary bg-[#f6fef9] pl-4 py-3 pr-3 rounded-r-lg text-foreground leading-relaxed">$1</blockquote>');
  // 3.5. Skill key 替换：英文 key → 中文名
  for (const [en, cn] of Object.entries(SKILL_KEY_MAP)) {
    html = html.replace(new RegExp(en, 'g'), cn);
  }
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<div class="flex gap-3 my-0.5 items-start"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-container text-primary text-xs font-semibold shrink-0 mt-0.5">$1</span><span>$2</span></div>');
  html = html.replace(/^[-*]\s+(.+)$/gm, '<div class="flex gap-2 my-0.5"><span class="text-primary mt-1.5">•</span><span>$1</span></div>');
  html = html.replace(/✅/g, '<span class="text-green-600">✅</span>');
  html = html.replace(/❌/g, '<span class="text-red-500">❌</span>');
  // Citation 强制编号：[1][2] 形式 → 可点击的 sup > button
  // data-citation 触发 CitationDrawer（page.tsx 的事件委托）
  html = html.replace(/\[(\d+)\]/g, (match, num) => {
    const msgAttr = messageId ? ` data-message-id="${messageId}"` : '';
    return `<sup><button type="button" class="citation-ref cursor-pointer text-primary font-semibold hover:underline" data-citation="${num}"${msgAttr}>[${num}]</button></sup>`;
  });
  html = html.replace(/\n/g, '<br/>');
  if (purify) {
    return purify.sanitize(html, {
      ALLOWED_TAGS: ['strong', 'blockquote', 'span', 'div', 'br', 'sup', 'button'],
      ALLOWED_ATTR: ['class', 'data-msg-id', 'data-cite-id', 'data-citation', 'data-citation-id', 'data-message-id'],
    });
  }
  // purify 未就绪（SSR 无 window）：转义为纯文本占位，绝不返回未消毒 HTML（关闭 XSS 窗口）
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ========== 渲染AI回复的4板块 ==========
function renderAIContent(
  content: string,
  messageId: string,
  citations: CitationData[] | undefined,
  expandedAnalysis: Set<string>,
  setExpandedAnalysis: React.Dispatch<React.SetStateAction<Set<string>>>,
  purify: { sanitize: (dirty: string, config?: Record<string, unknown>) => string } | null
) {
  const processedContent = content;

  // Citation 编号 [1][2] → <sup> 由 formatMarkdown 内部处理（带 messageId 注入）

  const sections = processedContent.split(/(?=##\s*【)/);

  return sections.map((section, idx) => {
    if (!section.trim()) return null;

    // 卡片容器样式（方案 A：Claude 简约优雅风 - 线框卡片）
    const cardClass = 'border border-[#e8e8e8] rounded-2xl p-6 mb-4 bg-white hover:shadow-sm transition-shadow';

    if (section.includes('【我的分析】')) {
      const isExpanded = expandedAnalysis.has(messageId);
      const analysisContent = section.replace(/##\s*【我的分析】[\s\n]*/, '');
      const checkCount = (analysisContent.match(/✅/g) || []).length;
      const crossCount = (analysisContent.match(/❌/g) || []).length;
      const summary = checkCount > 0 || crossCount > 0
        ? `已分析 ${checkCount + crossCount} 个关键问题`
        : '点击查看详细分析';

      return (
        <div key={idx} className="mb-4">
          <button
            type="button"
            onClick={() => {
              setExpandedAnalysis(prev => {
                const next = new Set(prev);
                if (next.has(messageId)) next.delete(messageId);
                else next.add(messageId);
                return next;
              });
            }}
            className="w-full flex items-center justify-between text-left rounded-xl bg-[#fafafa] border border-[#e8e8e8] px-5 py-4 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shrink-0">
                <Search className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-sm text-foreground">思考过程</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{summary}</span>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </button>

          {!isExpanded && (
            <div className="text-xs text-muted-foreground mt-1.5 truncate px-1">
              {summary}
            </div>
          )}

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isExpanded ? 'max-h-[2000px] opacity-100 mt-3' : 'max-h-0 opacity-0'
            }`}
          >
            <div className={cardClass}>
              <div
                className="text-sm text-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(analysisContent, purify, messageId, citations) }}
              />
            </div>
          </div>
        </div>
      );
    }

    if (section.includes('【框架技能')) {
      return (
        <div key={idx} className={cardClass}>
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#f0f0f0]">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-foreground">框架技能 + 原文知识点</span>
          </div>
          <div
            className="text-sm text-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(section.replace(/##\s*【框架技能\+原文知识点】[\s\n]*/, ''), purify, messageId, citations) }}
          />
        </div>
      );
    }

    if (section.includes('【底层心法】')) {
      return (
        <div key={idx} className={cardClass}>
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#f0f0f0]">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shrink-0">
              <Lightbulb className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-foreground">底层心法</span>
          </div>
          <div
            className="text-sm text-foreground leading-relaxed italic"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(section.replace(/##\s*【底层心法】[\s\n]*/, ''), purify, messageId, citations) }}
          />
        </div>
      );
    }

    if (section.includes('【开始引导】')) {
      return (
        <div key={idx} className={cardClass}>
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#f0f0f0]">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-foreground">开始引导</span>
          </div>
          <div
            className="text-sm text-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(section.replace(/##\s*【开始引导】[\s\n]*/, ''), purify, messageId, citations) }}
          />
        </div>
      );
    }

    return (
      <div
        key={idx}
        className="text-sm text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: formatMarkdown(section, purify, messageId, citations) }}
      />
    );
  });
}

// ========== ChatMessage 组件 Props ==========
interface ChatMessageProps {
  message: Message;
  isLoading: boolean;
  isLastMessage: boolean;
  status: string;
  copiedId: string | null;
  thumbsDownCount: number;
  regenerateCount: number;
  onRegenerate: () => void;
  onRetry: (failedAssistantId: string) => void;
  onCopy: (content: string, id: string) => void;
  onSpeak: (content: string) => void;
  onShare: (content: string) => void;
  onCitationClick: (citation: CitationData) => void;
  onThumbsDown: () => void;
}

function ChatMessage({
  message,
  isLoading,
  isLastMessage,
  status,
  copiedId,
  thumbsDownCount,
  regenerateCount,
  onRegenerate,
  onRetry,
  onCopy,
  onSpeak,
  onShare,
  onCitationClick,
  onThumbsDown,
}: ChatMessageProps) {
  const [expandedAnalysis, setExpandedAnalysis] = useState<Set<string>>(new Set());

  return (
    <div
      className={`mb-6 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {message.role === 'assistant' && (
        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0 mr-3 mt-0.5">
          <Briefcase className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      <div className={`${message.role === 'user' ? 'max-w-[85%] order-1' : 'flex-1 min-w-0 max-w-[680px]'}`}>
        {message.role === 'user' ? (
          <div className="rounded-2xl px-4 py-3 bg-primary text-primary-foreground rounded-br-md">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            {message.correctedFrom && (
              <p className="text-[10px] text-primary-foreground/60 mt-1">已纠正为：{message.content}</p>
            )}
          </div>
        ) : message.error ? (
          // 错误态：友好提示 + 重试入口（替代之前"抱歉请稍后重试"的白板）
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">{message.error.title}</p>
                <p className="text-sm text-amber-800 mt-1 leading-relaxed">{message.error.message}</p>
                {message.error.hint && (
                  <p className="text-xs text-amber-700/90 mt-2 leading-relaxed whitespace-pre-line">
                    {message.error.hint}
                  </p>
                )}
                <div className="mt-3">
                  <button
                    onClick={() => onRetry(message.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 active:scale-[0.97] transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    重试
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm">
            {/* 思考步骤面板 */}
            {message.thinkingSteps && message.thinkingSteps.length > 0 && (
              <ThinkingPanel
                steps={message.thinkingSteps}
                streamStatus={status}
              />
            )}
            {renderAIContent(message.content, message.id, message.citations, expandedAnalysis, setExpandedAnalysis, typeof window !== 'undefined' ? DOMPurify : null)}
            {/* 加载中光标 */}
            {isLoading && isLastMessage && message.role === 'assistant' && (
              <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {/* AI消息操作按钮 */}
        {message.role === 'assistant' && message.content && !isLoading && (
          <div className="flex items-center gap-1 mt-2 ml-1">
            {/* 置信度标识 */}
            {message.confidence && message.confidence !== 'high' && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                message.confidence === 'low' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
              }`}>
                <AlertTriangle className="w-3 h-3" />
                {message.confidence === 'low' ? '低置信度' : '中置信度'}
              </span>
            )}

            <button
              onClick={onRegenerate}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="重新生成"
            >
              <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => onCopy(message.content, message.id)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="复制"
            >
              {copiedId === message.id ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={() => onSpeak(message.content)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="朗读"
            >
              <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => onShare(message.content)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="分享"
            >
              <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* 引文角标入口 */}
            {message.citations && message.citations.length > 0 && (
              <button
                onClick={() => onCitationClick(message.citations![0])}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                title="查看引文"
              >
                <Quote className="w-3.5 h-3.5 text-primary" />
              </button>
            )}

            {/* 点踩 */}
            <button
              onClick={onThumbsDown}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="不满意"
            >
              <ThumbsDown className={`w-3.5 h-3.5 ${thumbsDownCount > 0 ? 'text-red-500 fill-red-500' : 'text-muted-foreground'}`} />
            </button>
          </div>
        )}

        {/* 安全警告 */}
        {message.safetyWarning && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {message.safetyWarning}
          </div>
        )}

        {/* 幻觉检测通知 */}
        {message.hallucinationDetected && (
          <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-50 text-orange-700 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">内容校验提示：</span>部分回答可能超出知识库范围，请结合实际情况判断。以上分析仅供参考。
            </div>
          </div>
        )}

        {/* 转人工提示 */}
        {message.transferToHuman && (
          <div className="mt-3 border border-blue-200 rounded-lg p-3 bg-blue-50">
            <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-1">
              <UserRound className="w-4 h-4" />
              建议转接人工顾问
            </div>
            <p className="text-xs text-blue-600 mb-2">{message.transferReason || '系统评估当前问题需要人工顾问介入'}</p>
            <p className="text-xs text-blue-500">系统已记录您的对话上下文，人工顾问将基于完整记录继续为您服务。</p>
          </div>
        )}

        {/* 点踩触发转人工 */}
        {message.role === 'assistant' && thumbsDownCount >= 2 && isLastMessage && (
          <div className="mt-3 border border-blue-200 rounded-lg p-3 bg-blue-50">
            <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-1">
              <UserRound className="w-4 h-4" />
              建议转接人工顾问
            </div>
            <p className="text-xs text-blue-600 mb-2">多次点踩，建议转接人工顾问</p>
            <p className="text-xs text-blue-500">系统已记录您的对话上下文，人工顾问将基于完整记录继续为您服务。</p>
          </div>
        )}

        {/* 重新生成触发转人工 */}
        {message.role === 'assistant' && regenerateCount >= 3 && isLastMessage && (
          <div className="mt-3 border border-blue-200 rounded-lg p-3 bg-blue-50">
            <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-1">
              <UserRound className="w-4 h-4" />
              建议转接人工顾问
            </div>
            <p className="text-xs text-blue-600 mb-2">多次重新生成，建议转接人工顾问</p>
            <p className="text-xs text-blue-500">系统已记录您的对话上下文，人工顾问将基于完整记录继续为您服务。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function areEqual(prev: ChatMessageProps, next: ChatMessageProps): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.citations === next.message.citations &&
    prev.message.confidence === next.message.confidence &&
    prev.message.safetyWarning === next.message.safetyWarning &&
    prev.message.hallucinationDetected === next.message.hallucinationDetected &&
    prev.message.transferToHuman === next.message.transferToHuman &&
    prev.message.thinkingSteps === next.message.thinkingSteps &&
    prev.message.error === next.message.error &&
    prev.isLoading === next.isLoading &&
    prev.isLastMessage === next.isLastMessage &&
    prev.status === next.status &&
    prev.copiedId === next.copiedId &&
    prev.thumbsDownCount === next.thumbsDownCount &&
    prev.regenerateCount === next.regenerateCount
  );
}

export default React.memo(ChatMessage, areEqual);
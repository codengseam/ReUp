import { NextRequest } from 'next/server';
import { LLMClient, type ModelCandidate } from '@/lib/llm-client';
import type { RAGResult } from '@/lib/rag';
import {
  retrieve,
  withTimeout,
  inputGuard,
  outputGuard,
  hallucinationCheck,
  assessConfidence,
  type Citation,
  type PrecomputedIntent,
} from '@/lib/rag';
import { classifyIntent, type IntentCategory, type IntentResult } from '@/lib/intent-classifier';
import {
  recordChatAPICall,
  recordInputGuardBlocked,
  recordOutputGuardBlocked,
} from '@/lib/admin-stats';
import { isSafeEndpoint } from '@/lib/url-safety';
import { getCustomPrompt, getRAGParams, getModelConfig } from '@/lib/server-config';
import { getModelCandidates } from '@/lib/runtime-config';
import { BUILTIN_MODEL_IDS } from '@/lib/models';

// 模型白名单字面量类型（与 src/lib/models.ts 的 BUILTIN_MODELS 保持一致）
// 如果新增/删除内置模型，需要同时更新 models.ts 和这里的字面量联合
// 实际值从 BUILTIN_MODEL_IDS 派生（编译期常量 union 由 TS 自动收敛）
type AllowedModelId = (typeof BUILTIN_MODEL_IDS)[number];

const ALLOWED_MODEL_IDS = BUILTIN_MODEL_IDS;
const DEFAULT_MODEL_ID: AllowedModelId = 'qwen3.6-plus-2026-04-02';

function validateModel(modelId: string | undefined): AllowedModelId {
  if (modelId && (ALLOWED_MODEL_IDS as readonly string[]).includes(modelId)) {
    return modelId as AllowedModelId;
  }
  return DEFAULT_MODEL_ID;
}

/** 自动补全 endpoint：兼容用户填 base_url 或完整路径 */
function normalizeEndpoint(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

// ===== 动态 System Prompt 构建 =====
// 基础 Prompt（通用模板，不含领域特定角色）
const BASE_SYSTEM_PROMPT = `你是一个基于知识库回答用户问题的 AI 助手。

## 你的身份
- 角色：通用知识助手
- 专长：基于检索到的知识库内容，准确、清晰地回答用户问题

## 你的工作方式
1. 基于知识库：优先依据检索到的知识库内容回答，不编造
2. 引用原文：引用知识库中的原文（用 [1][2] 编号标注出处）
3. 不确定时坦诚说明：知识库无相关内容时，明确告知用户
4. 结构清晰：用清晰的 markdown 结构组织回答

## 你拥有的 Skill

`;

// Skill 定义 Map：从 data/skills.json 动态加载（见 skills-loader.ts）
// 框架不硬编码任何领域特定 Skill
const SKILL_PROMPTS: Map<string, string> = new Map();

// Skill 精简摘要（无 RAG 结果时使用）
// 框架默认为空，由 data/skills.json 配置驱动
const SKILL_SUMMARIES = '';

const SKILL_RULES = `

## 知识库使用规则（RAG增强 - Grounded Generation）
你会收到从知识库检索到的参考资料，请严格遵循：
1. **忠实性要求**：所有事实性声明必须来自参考资料，不得编造
2. 如果参考资料与用户问题不相关，可以忽略，但不要编造替代内容
3. 参考资料中没有相关内容时，写"原文中暂无相关知识点"，不可编造
4. **禁止幻觉**：不要将参考资料中的概念张冠李戴或断章取义

## 输出格式
- 用清晰的 markdown 结构组织回答
- 引用知识库原文时用 [1][2] 编号标注出处
- 知识库无相关内容时，明确说明并给出通用建议

## 禁止行为
- ❌ 不编造知识（所有引用必须来自知识库）
- ❌ 不替用户做决策（只提供分析，决策权在用户）
- ❌ 不超出本应用主题范围
- **强制引用编号**：引用知识库原文时必须用 [1][2] 形式标注，编号对应 meta.citations 列表`;

/**
 * 根据 RAG 检索结果动态构建 Skill 部分的 Prompt
 * 框架通用版：不硬编码 Skill，从 SKILL_PROMPTS Map 动态查询
 */
function buildSkillPrompt(_ragResults: RAGResult[]): string {
  // 框架通用版：不注入硬编码 Skill
  return BASE_SYSTEM_PROMPT + SKILL_SUMMARIES + SKILL_RULES;
}

// 默认兜底话术
const BLOCKED_RESPONSE = '抱歉，您的问题涉及敏感内容，我无法回答。请尝试提出与本应用主题相关的问题。';
const LOW_CONFIDENCE_RESPONSE = '我对这个问题的把握不够大。建议您咨询专业人士获取更准确的建议。';
const OFF_TOPIC_RESPONSE = '我是本应用的 AI 助手。请提出与本应用主题相关的问题，我会尽力为您解答。';

/**
 * 把 classifyIntent 的 intent 映射到 retrieve 内部的 categoryFilter。
 * 框架通用版：不硬编码领域分类，统一返回 'all'
 */
function mapIntentToCategory(_intent: IntentCategory): 'all' {
  return 'all';
}

export const maxDuration = 300; // 5 min timeout for SSE streaming routes

export async function POST(request: NextRequest) {
  const chatStartTime = Date.now();
  const timer = (label: string, since?: number) => {
    const t = Date.now() - (since ?? chatStartTime);
    console.log(`[ChatTimer] ${label}: ${t}ms`);
    return Date.now();
  };

  let body: { messages?: unknown; model?: string; customProvider?: { providerType?: string; endpoint?: string; apiKey?: string; modelId?: string }; ragParams?: Record<string, unknown>; customPrompt?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, model, customProvider: clientCustomProvider, ragParams: clientRagParams, customPrompt: clientCustomPrompt } = body;

  // 服务端配置作为 fallback：前端没传时从 server-config.json 读取
  const serverConfig = await getModelConfig();
  const serverPrompt = await getCustomPrompt();
  const serverRagParams = await getRAGParams();

  // 优先使用前端传来的，fallback 到服务端存储
  const customProvider = clientCustomProvider ?? (
    serverConfig.defaultModelId && serverConfig.customModels
      ? serverConfig.customModels.find(m => m.id === serverConfig.defaultModelId)
      : undefined
  );
  const customPrompt = clientCustomPrompt ?? serverPrompt;
  const ragParams = clientRagParams ?? serverRagParams;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 提取最新用户消息用于RAG检索和安全审核
  const latestUserMessage = messages[messages.length - 1]?.content || '';
  const chatHistoryForGate = messages
    .slice(0, -1)
    .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));

  // ===== 输入门禁（阶段 2：unified classifier 替代 4 个弱 LLM 调用） =====
  const intentClassifierMode = process.env.INTENT_CLASSIFIER_MODE ?? 'unified';

  // 高危/中危正则模式（从旧 inputGuard 拆出，0 LLM 开销；保留是为了不破坏现有红线能力）
  const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
    { pattern: /暴力攻击|暴力伤害|威胁杀人|故意伤人|杀人|自杀身亡|自残行为|教唆自杀/gi, category: '暴力' },
    { pattern: /色情内容|裸体照片|性交易|黄色网站/gi, category: '色情' },
    { pattern: /种族歧视|仇恨言论|侮辱人格|人身攻击/gi, category: '仇恨' },
    { pattern: /制造炸弹|恐怖袭击|爆炸袭击|恐怖组织/gi, category: '恐怖' },
  ];
  const MEDIUM_RISK_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
    { pattern: /薪资|工资|薪酬|年终奖|股票|期权|补偿金|赔偿/gi, category: '薪资隐私' },
    { pattern: /CEO|CTO|CFO|VP|总裁|董事长/gi, category: '高管隐私' },
    { pattern: /密码|token|key|secret|credential/gi, category: '安全信息' },
  ];

  interface InputSafetyShape {
    safe: boolean;
    reason?: string;
    riskLevel: 'low' | 'medium' | 'high';
    category?: string;
  }

  let inputSafety: InputSafetyShape;
  let intentResult: IntentResult | null = null;

  if (intentClassifierMode === 'legacy') {
    // ===== Legacy 模式：旧 inputGuard（regex + 2 并行 LLM）=====
    inputSafety = await inputGuard(latestUserMessage);
    if (!inputSafety.safe) {
      void recordInputGuardBlocked();
      return new Response(
        JSON.stringify({ error: BLOCKED_RESPONSE }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    // ===== Unified 模式：高危正则 (0 LLM) + 中危正则 (0 LLM) + 单次 classifyIntent =====
    let highRiskHit: string | null = null;
    for (const { pattern, category } of HIGH_RISK_PATTERNS) {
      if (pattern.test(latestUserMessage)) {
        highRiskHit = category;
        break;
      }
    }
    if (highRiskHit) {
      void recordInputGuardBlocked();
      return new Response(
        JSON.stringify({ error: `输入内容涉及${highRiskHit}类敏感信息，请调整后重试` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let mediumRiskHit: string | null = null;
    for (const { pattern, category } of MEDIUM_RISK_PATTERNS) {
      if (pattern.test(latestUserMessage)) {
        mediumRiskHit = category;
        break;
      }
    }

    // 单次 LLM：意图 + 风险 + 重写 query + 策略 + 子查询
    intentResult = await classifyIntent(latestUserMessage, chatHistoryForGate);
    if (intentResult.intent === 'jailbreak') {
      void recordInputGuardBlocked();
      return new Response(
        JSON.stringify({ error: BLOCKED_RESPONSE }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 中危正则命中优先于 LLM 风险（保持旧 inputGuard 的中等风险标记能力）
    inputSafety = {
      safe: true,
      riskLevel: mediumRiskHit ? 'medium' : intentResult.riskLevel,
      reason: mediumRiskHit ? `涉及${mediumRiskHit}相关话题` : undefined,
      category: mediumRiskHit ?? intentResult.category,
    };
  }

  const encoder = new TextEncoder();

  // 选择模型（白名单校验 + 用户自定义）
  const selectedModel = validateModel(model);

  // Helper: safe enqueue that catches errors when stream is already closed
  const safeEnqueue = (controller: ReadableStreamDefaultController, data: string) => {
    try { controller.enqueue(encoder.encode(data)); } catch { /* client disconnected */ }
  };

  // Detect client disconnect and abort outstanding work
  let clientAborted = false;
  request.signal.addEventListener('abort', () => { clientAborted = true; }, { once: true });

  const stream = new ReadableStream({
    async start(controller) {
      const streamStartTime = Date.now();
      // Per-Vercel-docs: the runtime checks this flag between enqueue calls
      const isConnected = () => !clientAborted && !request.signal.aborted;
      try {
        // ===== 阶段1: 正在理解问题 =====
        safeEnqueue(controller, `data: ${JSON.stringify({ status: 'understanding' })}\n\n`);

        // ===== 阶段2: RAG检索 =====
        safeEnqueue(controller, `data: ${JSON.stringify({ status: 'searching' })}\n\n`);

        let ragContext = '';
        let citations: Citation[] = [];
        let ragResults: Array<{ content: string; score: number; docId?: string; source?: string; category?: string; skillName?: string }> = [];
        let rewrittenQuery: string | undefined;
        let strategy: string | undefined;

        try {
          const chatHistory = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          }));

          // 阶段 2：unified 模式下，retrieve 内部 3 个 LLM 调用（rewrite/route/infer）已被
          // classifyIntent 单次替代；通过 precomputed 注入，让 retrieve 复用 classifyIntent 的产物
          const precomputed: PrecomputedIntent | undefined = intentResult
            ? {
                rewrittenQuery: intentResult.rewrittenQuery,
                strategy: intentResult.strategy,
                subQueries: intentResult.subQueries,
                categoryFilter: mapIntentToCategory(intentResult.intent),
              }
            : undefined;

          // 总 10s 兜底超时（避免上游 LLM / Knowledge 长时间挂起）
          const ragResponse = await withTimeout(
            retrieve(
              latestUserMessage,
              5,
              chatHistory,
              ragParams as Record<string, unknown> | undefined,
              precomputed
            ),
            10000,
            'RAG total'
          );
          ragContext = ragResponse.context;
          citations = ragResponse.citations;
          ragResults = ragResponse.results;
          rewrittenQuery = ragResponse.rewrittenQuery;
          strategy = ragResponse.strategy;

          console.log(`[Chat] RAG: strategy=${strategy}, results=${ragResults.length}, rewritten=${rewrittenQuery || 'none'}, intent=${intentResult?.intent ?? 'legacy'}`);

          // ===== Thinking Steps（阶段 2：步骤 1+2 合并为"理解用户意图"）=====
          if (intentResult) {
            safeEnqueue(controller, `data: ${JSON.stringify({
              thinkingStep: {
                step: 1,
                title: '理解用户意图',
                description: `意图: ${intentResult.intent} ｜ 策略: ${strategy || '通用检索'} ｜ 重写: "${rewrittenQuery || latestUserMessage}"`,
                status: 'completed',
                details: '单次 LLM 完成意图分类 + 风险审核 + 查询重写 + 策略规划...'
              }
            })}\n\n`);
          } else {
            // legacy 模式：保留旧的两步
            safeEnqueue(controller, `data: ${JSON.stringify({
              thinkingStep: {
                step: 1,
                title: '理解用户核心诉求',
                description: `将问题重写为: "${rewrittenQuery || latestUserMessage}"`,
                status: 'completed',
                details: '分析对话上下文，识别用户真实意图...'
              }
            })}\n\n`);

            safeEnqueue(controller, `data: ${JSON.stringify({
              thinkingStep: {
                step: 2,
                title: '规划检索策略',
                description: `采用策略: ${strategy || '通用检索'}`,
                status: 'completed',
                details: '根据问题类型选择最优检索方案...'
              }
            })}\n\n`);
          }

          safeEnqueue(controller, `data: ${JSON.stringify({
            thinkingStep: {
              step: 2,
              title: '检索相关知识',
              description: `检索到 ${ragResults.length} 条参考资料`,
              status: 'completed',
              details: '执行混合检索与重排序...'
            }
          })}\n\n`);

          safeEnqueue(controller, `data: ${JSON.stringify({
            thinkingStep: {
              step: 3,
              title: '筛选优质内容',
              description: '完成内容去重与质量评估',
              status: 'completed',
              details: '对检索结果进行相关性筛选...'
            }
          })}\n\n`);
        } catch (ragError) {
          console.error('[Chat] RAG retrieval failed, continuing without context:', ragError instanceof Error ? ragError.message : ragError);
          // 超时或检索失败，降级为空 context，继续 LLM 生成
          ragContext = '';
          citations = [];
          ragResults = [];
        }

        // ===== 话题越界检测（unified: intent==='off_topic'；legacy: category==='话题越界'）=====
        const isOffTopic = intentResult?.intent === 'off_topic' || inputSafety.category === '话题越界';
        if (isOffTopic) {
          safeEnqueue(controller, `data: ${JSON.stringify({ status: 'generating' })}\n\n`);
          safeEnqueue(controller, `data: ${JSON.stringify({ content: OFF_TOPIC_RESPONSE })}\n\n`);
          safeEnqueue(controller, 'data: [DONE]\n\n');
          controller.close();
          return;
        }

        // ===== 阶段3: 正在生成答案 =====
        safeEnqueue(controller, `data: ${JSON.stringify({ status: 'generating' })}\n\n`);

        // 发送元数据（查询策略+重写信息+引文+意图）
        safeEnqueue(controller, `data: ${JSON.stringify({
            meta: {
              strategy,
              rewrittenQuery,
              citations,
              riskLevel: inputSafety.riskLevel,
              intent: intentResult?.intent,
            }
          })}\n\n`
        );

        // ===== 构建Grounded System Prompt =====
        // 使用 customPrompt 或根据 RAG 结果动态构建 Skill Prompt
        let systemPrompt: string;
        if (customPrompt) {
          systemPrompt = customPrompt;
          // 如果自定义 prompt 不包含 Skill 定义，补充精简摘要
          if (!customPrompt.includes('Skill') && !customPrompt.includes('skill')) {
            systemPrompt += '\n\n' + SKILL_SUMMARIES + SKILL_RULES;
          }
        } else {
          systemPrompt = buildSkillPrompt(ragResults as RAGResult[]);
        }

        if (ragContext) {
      systemPrompt = `${systemPrompt}\n\n## 知识库检索结果\n\n以下是与你当前问题最相关的参考资料，请严格基于这些内容回答。所有事实性声明必须来自以下参考资料，不得编造：\n\n${ragContext}`;
    }

        // ===== 敏感话题警告 =====
        if (inputSafety.riskLevel === 'medium' && inputSafety.category) {
          systemPrompt += `\n\n## 注意：用户问题涉及${inputSafety.category}相关话题，请谨慎回答，避免透露具体数字或隐私信息。`;
        }

        // ===== 检查客户端是否已断开 =====
        if (!isConnected()) {
          controller.close();
          return;
        }

        // ===== LLM流式生成 =====
        const allMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...messages,
        ];

        let fullOutput = '';

        if (customProvider?.endpoint && customProvider?.apiKey && customProvider?.modelId) {
          // 阶段 3：SSRF 防护 — 拒绝内网 / 元数据端点
          const urlSafety = isSafeEndpoint(customProvider.endpoint);
          if (!urlSafety.safe) {
            console.warn(`[Chat] Blocked unsafe customProvider endpoint: ${customProvider.endpoint} (${urlSafety.reason})`);
            safeEnqueue(controller, `data: ${JSON.stringify({ error: 'endpoint_blocked', reason: urlSafety.reason ?? 'unknown' })}\n\n`);
            safeEnqueue(controller, 'data: [DONE]\n\n');
            controller.close();
            return;
          }

          // 自定义模型：使用 fetch 直接调用（自动补全 /chat/completions），30s 超时
          const cpAborter = new AbortController();
          const cpTimeout = setTimeout(() => cpAborter.abort(), 30_000);
          let cpReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
          try {
            const cpResponse = await fetch(normalizeEndpoint(customProvider.endpoint), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${customProvider.apiKey}`,
              },
              body: JSON.stringify({
                model: customProvider.modelId,
                messages: allMessages,
                temperature: 0.7,
                stream: true,
              }),
              signal: cpAborter.signal,
            });

            if (!cpResponse.ok) {
              const errorText = await cpResponse.text().catch(() => '');
              safeEnqueue(controller, `data: ${JSON.stringify({ error: `自定义模型调用失败 (${cpResponse.status}): ${errorText.substring(0, 200)}` })}\n\n`);
            } else if (cpResponse.body) {
              cpReader = cpResponse.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              while (true) {
                if (!isConnected()) break;
                const { done, value } = await cpReader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || !trimmed.startsWith('data: ')) continue;
                  const data = trimmed.slice(6);
                  if (data === '[DONE]') continue;
                  try {
                    const parsed = JSON.parse(data);
                    const text = parsed.choices?.[0]?.delta?.content || '';
                    if (text) {
                      fullOutput += text;
                      safeEnqueue(controller, `data: ${JSON.stringify({ content: text })}\n\n`);
                    }
                  } catch { /* skip unparseable chunks */ }
                }
              }
            }
          } finally {
            clearTimeout(cpTimeout);
            if (cpReader) {
              try { cpReader.releaseLock(); } catch { /* already released */ }
            }
          }
        } else {
          // 内置模型：使用 LLMClient + 自动 fallback 链
          // （qwen3.6-plus-2026-04-02 → qwen3.6-plus；GLM 单独走 zhipu 链）
          const candidates: ModelCandidate[] = await getModelCandidates(selectedModel);
          if (candidates.length === 0) {
            safeEnqueue(controller, `data: ${JSON.stringify({ error: `未配置 ${selectedModel} 所需的 API Key，请到管理后台「API Keys」配置` })}\n\n`);
            safeEnqueue(controller, 'data: [DONE]\n\n');
            controller.close();
            return;
          }
          const client = new LLMClient();

          // 120s 超时 (比 maxDuration 短，确保能在超时前结束)
          const llmStream = client.stream(allMessages, {
            models: candidates,
            temperature: 0.7,
            timeoutMs: 120_000,
          });

          for await (const chunk of llmStream) {
            if (!isConnected()) break;
            if (chunk.content) {
              const text = chunk.content.toString();
              fullOutput += text;
              safeEnqueue(controller, `data: ${JSON.stringify({ content: text })}\n\n`);
            }
          }
        }

        // ===== 输出门禁 =====
        const outputSafety = await outputGuard(fullOutput);
        if (!outputSafety.safe) {
          console.warn('[Chat] Output safety check failed:', outputSafety.reason);
          void recordOutputGuardBlocked();
          safeEnqueue(controller, `data: ${JSON.stringify({
              safetyWarning: '⚠️ 回复内容已触发安全审核，已替换为安全提示',
              replaceContent: `抱歉，生成的内容涉及${outputSafety.category || '敏感'}话题，已自动替换。请重新提问。`
            })}\n\n`);
        }

        // ===== 幻觉校验 =====
        if (ragContext) {
          const hallucinationResult = await hallucinationCheck(fullOutput, ragContext);
          if (!hallucinationResult.faithful) {
            console.warn('[Chat] Hallucination detected:', hallucinationResult.ungroundedParts);
            safeEnqueue(controller, `data: ${JSON.stringify({ hallucinationDetected: true, hallucinationDetails: hallucinationResult.ungroundedParts })}\n\n`);
          }
        }

        // ===== 置信度评估 & 转人工 =====
        // 传入 latestUserMessage 让热门问题（已收录在 HOT_QUERIES 中的问题及其变体）直接拿高置信度
        const confidence = assessConfidence(ragResults as RAGResult[], latestUserMessage);
        const shouldTransferToHuman = confidence.level === 'low';
        safeEnqueue(controller, `data: ${JSON.stringify({
            confidence: confidence.level,
            confidenceScore: confidence.score,
            confidenceReason: confidence.reason,
            transferToHuman: shouldTransferToHuman,
            ...(shouldTransferToHuman ? {
              transferReason: '当前问题置信度较低，建议转接人工支持获取更精准的指导',
              conversationContext: messages.slice(-6).map(m => m.role + ': ' + m.content).join('\n')
            } : {})
          })}\n\n`);

        safeEnqueue(controller, 'data: [DONE]\n\n');
        void recordChatAPICall(Date.now() - streamStartTime);
        controller.close();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        safeEnqueue(controller, `data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        safeEnqueue(controller, 'data: [DONE]\n\n');
        void recordChatAPICall(Date.now() - streamStartTime);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

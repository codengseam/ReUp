import type { Message } from '@/components/chat/types';

const STORAGE_KEY = 'chat_conversations_v1';
const CURRENT_KEY = 'chat_current_conversation_id';

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function generateTitle(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '新对话';

  // 1. 清理标点（保留问号以便后续判断）
  const noPunct = trimmed
    .replace(/[！!。.,，；;：:、\n\r\t]+/g, ' ')
    .replace(/\?/g, '？')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. 去除常见开场词（敬语/请求词）
  const withoutPrefix = noPunct
    .replace(
      /^(请问|想问一下|想问|请教|问个|问下|能不能|可以|请帮我|帮我|我想问|想了解|想知道|想咨询|关于|对于)/i,
      ''
    )
    .trim();

  // 3. 去除常见疑问词后缀（保留问号/句号前的核心词）
  // 先去掉尾部标点，再去后缀疑问词
  const withoutTrailingPunct = withoutPrefix.replace(/[？?。.,，!！]+$/, '').trim();
  const withoutSuffix = withoutTrailingPunct.replace(
    /(怎么办|怎么[一-龥]{0,2}|如何|为什么|为何|是什么|有哪些|有哪些方面|哪些|什么|啥|吗|啊|呢|呀|呗|哈)$/i,
    ''
  ).trim();

  // 4. 选择最佳候选：清理后 → 仅去前缀 → 原文本
  const candidate = withoutSuffix || withoutPrefix || noPunct;

  // 5. 长度适配：4-14 字最佳
  if (candidate.length >= 3 && candidate.length <= 14) {
    return candidate;
  }
  if (candidate.length > 14) {
    return candidate.slice(0, 12) + '…';
  }

  // 6. 太短就回退到原文前 10 字
  return trimmed.slice(0, 10);
}

export function getConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function getCurrentConversation(): Conversation | null {
  if (typeof window === 'undefined') return null;
  const conversations = getConversations();
  const currentId = localStorage.getItem(CURRENT_KEY);
  if (!currentId) return conversations[0] ?? null;
  return conversations.find(c => c.id === currentId) ?? conversations[0] ?? null;
}

export function setCurrentConversation(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CURRENT_KEY, id);
}

export function createConversation(): Conversation {
  const conversation: Conversation = {
    id: generateId(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const conversations = getConversations();
  conversations.unshift(conversation);
  saveConversations(conversations);
  setCurrentConversation(conversation.id);
  return conversation;
}

export function addMessageToConversation(
  conversationId: string,
  message: Message
): Conversation {
  const conversations = getConversations();
  const index = conversations.findIndex(c => c.id === conversationId);
  if (index === -1) throw new Error(`Conversation ${conversationId} not found`);

  const conv = conversations[index];
  conv.messages.push(message);
  conv.updatedAt = Date.now();

  if (conv.title === '新对话' && message.role === 'user') {
    conv.title = generateTitle(message.content);
  }

  conversations[index] = conv;
  saveConversations(conversations);
  return conv;
}

export function updateConversationMessages(
  conversationId: string,
  messages: Message[]
): Conversation {
  const conversations = getConversations();
  const index = conversations.findIndex(c => c.id === conversationId);
  if (index === -1) throw new Error(`Conversation ${conversationId} not found`);

  const conv = conversations[index];
  conv.messages = messages;
  conv.updatedAt = Date.now();

  // 自动重命名：标题仍是默认 "新对话" 时，按首条 user 消息生成摘要
  if (conv.title === '新对话') {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      conv.title = generateTitle(firstUserMsg.content);
    }
  }

  conversations[index] = conv;
  saveConversations(conversations);
  return conv;
}

export function deleteConversation(conversationId: string) {
  const conversations = getConversations().filter(c => c.id !== conversationId);
  saveConversations(conversations);

  const currentId = localStorage.getItem(CURRENT_KEY);
  if (currentId === conversationId) {
    const next = conversations[0];
    if (next) {
      setCurrentConversation(next.id);
    } else {
      localStorage.removeItem(CURRENT_KEY);
    }
  }
}

export function groupConversationsByTime(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  const groups = {
    today: [] as Conversation[],
    yesterday: [] as Conversation[],
    earlier: [] as Conversation[],
  };

  for (const conv of conversations) {
    if (conv.updatedAt >= today) {
      groups.today.push(conv);
    } else if (conv.updatedAt >= yesterday) {
      groups.yesterday.push(conv);
    } else {
      groups.earlier.push(conv);
    }
  }

  return groups;
}

export function clearConversationMessages(conversationId: string): Conversation {
  const conversations = getConversations();
  const index = conversations.findIndex(c => c.id === conversationId);
  if (index === -1) throw new Error(`Conversation ${conversationId} not found`);

  conversations[index].messages = [];
  conversations[index].updatedAt = Date.now();
  saveConversations(conversations);
  return conversations[index];
}

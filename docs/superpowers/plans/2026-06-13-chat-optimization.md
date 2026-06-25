# AI 聊天助手优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 AI 聊天助手的 5 个体验问题（内容清洗、多技能调用、重新生成、清空按钮、对话管理），全部按 TDD 交付。

**Architecture:** 后端改 Prompt 约束 + 前端兜底清洗；重新生成修复状态逻辑；对话管理新增 localStorage 数据层 + 左侧栏 UI；核心逻辑用 Vitest + React Testing Library 覆盖。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + Tailwind CSS + shadcn/ui + Vitest + React Testing Library + jsdom

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/lib/conversation-store.ts` | 多对话数据管理：CRUD、localStorage 持久化、标题生成、时间分组 |
| `src/components/chat/ConversationSidebar.tsx` | 左侧边栏 UI：新建按钮、对话列表、分组、高亮、删除 |
| `src/components/chat/ChatMessage.tsx` | 消息渲染：修改 `formatMarkdown` 换行压缩、Skill 清洗、行高调整 |
| `src/app/api/chat/route.ts` | 后端 Prompt：修改 `SKILL_RULES` 和引文标注要求 |
| `src/app/page.tsx` | 页面集成：重新生成修复、清空按钮位置、对话状态管理升级 |
| `vitest.config.ts` | Vitest 配置：jsdom 环境、路径别名 |
| `src/lib/__tests__/conversation-store.test.ts` | 对话存储单元测试 |
| `src/components/chat/__tests__/formatMarkdown.test.ts` | Markdown 格式化单元测试（导出 `formatMarkdown` 测试） |

---

### Task 1: 安装测试框架

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: 安装依赖**

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

- [ ] **Step 2: 创建 Vitest 配置**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: 创建测试 setup 文件**

Create `src/test-setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: 添加 test script**

Modify `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 验证安装**

Run: `pnpm test`
Expected: `No test files found, exiting with code 0`

---

### Task 2: 对话存储数据层（TDD）

**Files:**
- Create: `src/lib/conversation-store.ts`
- Create: `src/lib/__tests__/conversation-store.test.ts`

- [ ] **Step 1: 写 failing test — 创建对话**

Create `src/lib/__tests__/conversation-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createConversation,
  getConversations,
  getCurrentConversation,
  setCurrentConversation,
  addMessageToConversation,
  deleteConversation,
  generateTitle,
  groupConversationsByTime,
} from '../conversation-store';
import type { Message } from '@/components/chat/types';

describe('conversation-store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('createConversation creates a conversation with defaults', () => {
    const conv = createConversation();
    expect(conv.id).toBeDefined();
    expect(conv.title).toBe('新对话');
    expect(conv.messages).toEqual([]);
    expect(conv.createdAt).toBeGreaterThan(0);
    expect(conv.updatedAt).toBeGreaterThan(0);
  });

  it('getConversations returns empty array initially', () => {
    expect(getConversations()).toEqual([]);
  });

  it('getCurrentConversation returns null initially', () => {
    expect(getCurrentConversation()).toBeNull();
  });

  it('addMessageToConversation updates messages and title', () => {
    const conv = createConversation();
    setCurrentConversation(conv.id);

    const userMsg: Message = {
      id: '1',
      role: 'user',
      content: '作为技术负责人，我该学什么方向才能从P7升到P8？',
      timestamp: Date.now(),
    };

    const updated = addMessageToConversation(conv.id, userMsg);
    expect(updated.messages).toHaveLength(1);
    expect(updated.title).toBe('作为技术负责人，我该学什么方向才能从P7升到P8？'.slice(0, 10));
  });

  it('deleteConversation removes conversation', () => {
    const conv = createConversation();
    deleteConversation(conv.id);
    expect(getConversations()).toHaveLength(0);
  });

  it('groupConversationsByTime groups correctly', () => {
    const now = Date.now();
    const convs = [
      { id: '1', title: 'A', messages: [], createdAt: now, updatedAt: now },
      { id: '2', title: 'B', messages: [], createdAt: now - 86400000, updatedAt: now - 86400000 },
      { id: '3', title: 'C', messages: [], createdAt: now - 172800000, updatedAt: now - 172800000 },
    ];
    localStorage.setItem('chat_conversations_v1', JSON.stringify(convs));
    localStorage.setItem('chat_current_conversation_id', '1');

    const groups = groupConversationsByTime(getConversations());
    expect(groups.today).toHaveLength(1);
    expect(groups.yesterday).toHaveLength(1);
    expect(groups.earlier).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/__tests__/conversation-store.test.ts`
Expected: FAIL — `createConversation is not defined` 等

- [ ] **Step 3: 实现最小代码**

Create `src/lib/conversation-store.ts`:

```typescript
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

  conversations[index].messages = messages;
  conversations[index].updatedAt = Date.now();
  saveConversations(conversations);
  return conversations[index];
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/__tests__/conversation-store.test.ts`
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts src/test-setup.ts src/lib/conversation-store.ts src/lib/__tests__/conversation-store.test.ts
git commit -m "feat: add conversation store with localStorage persistence and tests"
```

---

### Task 3: formatMarkdown 单元测试（TDD）

**Files:**
- Modify: `src/components/chat/ChatMessage.tsx`（导出 `formatMarkdown`）
- Create: `src/components/chat/__tests__/formatMarkdown.test.ts`

- [ ] **Step 1: 导出 formatMarkdown 并写 failing test**

Modify `src/components/chat/ChatMessage.tsx`，在 `formatMarkdown` 函数定义前加 `export`：

```typescript
export function formatMarkdown(text: string, purify: typeof DOMPurify): string {
```

Create `src/components/chat/__tests__/formatMarkdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatMarkdown } from '../ChatMessage';
import DOMPurify from 'dompurify';

// Mock DOMPurify for Node environment
const mockPurify = {
  sanitize: (html: string) => html,
} as unknown as typeof DOMPurify;

describe('formatMarkdown', () => {
  it('compresses double newlines to single', () => {
    const input = 'Line1\n\nLine2\n\n\nLine3';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('<br/><br/>');
    expect(result).toContain('Line1<br/>Line2<br/>Line3');
  });

  it('replaces english skill key with chinese name', () => {
    const input = '**调用的 Skill**: p8-lingyu-zhuanjia';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('p8-lingyu-zhuanjia');
    expect(result).toContain('领域专家演进');
  });

  it('removes author prefix from citation', () => {
    const input = '> 《大厂晋升指南》, 李运华。P8需具备532精力分配';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('《大厂晋升指南》');
    expect(result).not.toContain('李运华');
    expect(result).toContain('P8需具备532精力分配');
  });

  it('removes book-author prefix variations', () => {
    const input = '> — 李运华,《大厂晋升指南》。P8需具备532精力分配';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('李运华');
    expect(result).toContain('P8需具备532精力分配');
  });

  it('renders skill badge with chinese name', () => {
    const input = '**调用的 Skill**: jinsheng-diceng-luoji';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('jinsheng-diceng-luoji');
    expect(result).toContain('晋升底层逻辑');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/chat/__tests__/formatMarkdown.test.ts`
Expected: FAIL — `p8-lingyu-zhuanjia` still present, `<br/><br/>` still present

- [ ] **Step 3: 修改 formatMarkdown 实现**

Modify `src/components/chat/ChatMessage.tsx` 中 `formatMarkdown` 函数：

1. 在函数开头添加 Skill key 映射表：

```typescript
const SKILL_KEY_MAP: Record<string, string> = {
  'p8-lingyu-zhuanjia': '领域专家演进',
  'jinsheng-diceng-luoji': '晋升底层逻辑',
  'jinsheng-sanda-yuanze': '晋升三大原则',
  'nengli-sanzhong-jingjie': '能力三重境界',
};
```

2. 在现有替换逻辑之后、`
 → <br/>` 之前，添加清洗逻辑：

```typescript
  // Skill key 替换：英文 key → 中文名
  for (const [en, cn] of Object.entries(SKILL_KEY_MAP)) {
    html = html.replace(new RegExp(en, 'g'), cn);
  }

  // 清洗原文引用中的作者/书名前缀
  // 匹配模式：> 《书名》, 作者。 或 > — 作者,《书名》。
  html = html.replace(
    /(&gt;\s*)[—\-]?\s*[^\n《]*《[^》]+》\s*,?\s*[^。\n]*。?/g,
    '$1'
  );
```

3. 确认换行压缩逻辑（已在前序修改中完成）：

```typescript
  // 3. 压缩所有连续空行为单个换行，避免渲染出多余空行
  html = html.replace(/\n{2,}/g, '\n');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/chat/__tests__/formatMarkdown.test.ts`
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatMessage.tsx src/components/chat/__tests__/formatMarkdown.test.ts
git commit -m "feat: formatMarkdown skill key translation and citation cleaning with tests"
```

---

### Task 4: 后端 Prompt 修改

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: 修改 SKILL_RULES 输出格式**

Replace the existing `SKILL_RULES` output format section with:

```typescript
const SKILL_RULES = `...（与 spec 中一致的紧凑格式，要求多 Skill 列出、禁止英文 key、禁止作者引用）...`;
```

关键修改点：
- 去掉 `[^1]` `[^2]` 角标要求
- 去掉 `— 作者, 《书名》` 引用格式要求
- Skill 名称只保留中文，禁止英文 key
- 明确要求"若涉及多个 Skill，依次列出每组"

- [ ] **Step 2: 删除引文标注要求段落**

Remove or simplify the `## 引文标注要求` section in the RAG context append.

- [ ] **Step 3: 验证 ts-check**

Run: `pnpm run ts-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: update prompt to enforce chinese skill names and multi-skill output"
```

---

### Task 5: 重新生成逻辑修复

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 修改 sendMessage 签名和逻辑**

In `src/app/page.tsx`, update `sendMessage`:

```typescript
const sendMessage = useCallback(async (content: string, isRegenerating = false) => {
  // ... existing abort logic ...

  let currentMessages: Message[];

  if (isRegenerating) {
    // Regenerate: use current messages as-is, do NOT add a new user message
    currentMessages = messages;
  } else {
    // Normal send: add user message first
    const userMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    currentMessages = [...messages, userMessage];
  }

  // ... rest of the function uses currentMessages instead of messages ...
}, [messages, input, selectedModel, isAdmin]);
```

- [ ] **Step 2: 修改 regenerate 调用方式**

Update `regenerate`:

```typescript
const regenerate = useCallback(() => {
  if (messages.length < 2) return;
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return;
  setRegenerateCount(prev => prev + 1);
  // Remove the last assistant message
  setMessages(prev => prev.slice(0, -1));
  setPendingRegenerate(lastUserMsg.content);
  // Pass true to skip adding a new user message
  sendMessage(lastUserMsg.content, true);
}, [messages, sendMessage]);
```

- [ ] **Step 3: 验证 ts-check**

Run: `pnpm run ts-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix: regenerate no longer duplicates user message"
```

---

### Task 6: 清空按钮位置调整

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 在 header 区域添加清空按钮**

In the `page.tsx` header section (inside `max-w-4xl` container), add a visible clear button:

```tsx
<div className="flex items-center gap-2">
  {/* existing buttons */}
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
</div>
```

Import `Trash2` from `lucide-react` and `AlertDialog` components.

- [ ] **Step 2: 保留右侧面板中的清空按钮**

Keep the existing clear button in the sidebar panel as a fallback.

- [ ] **Step 3: 验证 ts-check**

Run: `pnpm run ts-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add visible clear-chat button in header"
```

---

### Task 7: 左侧边栏 UI 组件

**Files:**
- Create: `src/components/chat/ConversationSidebar.tsx`
- Create: `src/components/chat/__tests__/ConversationSidebar.test.tsx`

- [ ] **Step 1: 写 failing test**

Create `src/components/chat/__tests__/ConversationSidebar.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationSidebar } from '../ConversationSidebar';
import type { Conversation } from '@/lib/conversation-store';

describe('ConversationSidebar', () => {
  const mockConversations: Conversation[] = [
    { id: '1', title: '对话A', messages: [], createdAt: Date.now(), updatedAt: Date.now() },
    { id: '2', title: '对话B', messages: [], createdAt: Date.now() - 86400000, updatedAt: Date.now() - 86400000 },
  ];

  it('renders new chat button', () => {
    render(
      <ConversationSidebar
        conversations={mockConversations}
        currentId="1"
        onNewChat={() => {}}
        onSelectChat={() => {}}
        onDeleteChat={() => {}}
      />
    );
    expect(screen.getByText('新建对话')).toBeInTheDocument();
  });

  it('renders conversation list with groups', () => {
    render(
      <ConversationSidebar
        conversations={mockConversations}
        currentId="1"
        onNewChat={() => {}}
        onSelectChat={() => {}}
        onDeleteChat={() => {}}
      />
    );
    expect(screen.getByText('对话A')).toBeInTheDocument();
    expect(screen.getByText('对话B')).toBeInTheDocument();
  });

  it('calls onSelectChat when conversation clicked', () => {
    const onSelect = vi.fn();
    render(
      <ConversationSidebar
        conversations={mockConversations}
        currentId="1"
        onNewChat={() => {}}
        onSelectChat={onSelect}
        onDeleteChat={() => {}}
      />
    );
    fireEvent.click(screen.getByText('对话B'));
    expect(onSelect).toHaveBeenCalledWith('2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/chat/__tests__/ConversationSidebar.test.tsx`
Expected: FAIL — component not found

- [ ] **Step 3: 实现组件**

Create `src/components/chat/ConversationSidebar.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/conversation-store';
import { groupConversationsByTime } from '@/lib/conversation-store';

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ConversationSidebar({
  conversations,
  currentId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isCollapsed = false,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const groups = groupConversationsByTime(conversations);

  if (isCollapsed) {
    return (
      <div className="w-12 border-r bg-background flex flex-col items-center py-3 gap-2">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse}>
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const renderGroup = (title: string, items: Conversation[]) => {
    if (items.length === 0) return null;
    return (
      <div key={title} className="px-2 py-2">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1">{title}</div>
        {items.map(conv => (
          <div
            key={conv.id}
            className={cn(
              'group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer text-sm transition-colors',
              currentId === conv.id
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted'
            )}
            onClick={() => onSelectChat(conv.id)}
            onMouseEnter={() => setHoveredId(conv.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{conv.title}</span>
            {(hoveredId === conv.id || currentId !== conv.id) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(conv.id);
                }}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-64 border-r bg-background flex flex-col shrink-0">
      <div className="flex items-center justify-between p-3 border-b">
        <Button variant="outline" className="flex-1 justify-start gap-2" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          新建对话
        </Button>
        <Button variant="ghost" size="icon" className="ml-2" onClick={onToggleCollapse}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {renderGroup('今天', groups.today)}
        {renderGroup('昨天', groups.yesterday)}
        {renderGroup('更早', groups.earlier)}
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/chat/__tests__/ConversationSidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ConversationSidebar.tsx src/components/chat/__tests__/ConversationSidebar.test.tsx
git commit -m "feat: add conversation sidebar component with tests"
```

---

### Task 8: 页面集成 — 多对话管理

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 重构 page.tsx 状态管理**

Replace the `messages` + `sessionStorage` state with `conversations` + `currentConversationId`:

```typescript
import {
  getConversations,
  getCurrentConversation,
  createConversation,
  addMessageToConversation,
  updateConversationMessages,
  deleteConversation,
  clearConversationMessages,
  setCurrentConversation,
} from '@/lib/conversation-store';

// State
const [conversations, setConversations] = useState<Conversation[]>([]);
const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

// Derived state
const messages = useMemo(() => {
  const conv = conversations.find(c => c.id === currentConversationId);
  return conv?.messages ?? [];
}, [conversations, currentConversationId]);

// Initialize from store on mount
useEffect(() => {
  const convs = getConversations();
  const current = getCurrentConversation();
  setConversations(convs);
  setCurrentConversationId(current?.id ?? null);
  if (convs.length === 0) {
    const newConv = createConversation();
    setConversations([newConv]);
    setCurrentConversationId(newConv.id);
  }
}, []);
```

- [ ] **Step 2: 更新 sendMessage 同步到 store**

In `sendMessage`, after adding user message and after receiving assistant message:

```typescript
// After adding user message
if (!isRegenerating) {
  addMessageToConversation(currentConversationId!, userMessage);
  setConversations(getConversations());
}

// After receiving assistant message
addMessageToConversation(currentConversationId!, assistantMessage);
setConversations(getConversations());
```

- [ ] **Step 3: 更新 clearMessages**

```typescript
const clearMessages = useCallback(() => {
  if (!currentConversationId) return;
  clearConversationMessages(currentConversationId);
  setConversations(getConversations());
}, [currentConversationId]);
```

- [ ] **Step 4: 添加 ConversationSidebar 到布局**

Wrap the page content with sidebar:

```tsx
<div className="flex h-screen w-full overflow-hidden">
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
    }}
    onDeleteChat={(id) => {
      deleteConversation(id);
      setConversations(getConversations());
      const current = getCurrentConversation();
      setCurrentConversationId(current?.id ?? null);
    }}
  />
  <div className="flex-1 flex flex-col overflow-hidden">
    {/* existing page content */}
  </div>
</div>
```

- [ ] **Step 5: 移除 sessionStorage 相关逻辑**

Remove `CHAT_STORAGE_KEY` and all `sessionStorage.getItem/setItem/removeItem` calls for messages.

- [ ] **Step 6: 验证 ts-check**

Run: `pnpm run ts-check`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: integrate multi-conversation management with sidebar"
```

---

### Task 9: 响应式与边栏折叠

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/chat/ConversationSidebar.tsx`

- [ ] **Step 1: 添加响应式折叠状态**

In `page.tsx`, add:

```typescript
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

// Auto-collapse on small screens
useEffect(() => {
  const handleResize = () => {
    setSidebarCollapsed(window.innerWidth < 768);
  };
  handleResize();
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

- [ ] **Step 2: 传递折叠状态到 Sidebar**

```tsx
<ConversationSidebar
  conversations={conversations}
  currentId={currentConversationId}
  onNewChat={...}
  onSelectChat={...}
  onDeleteChat={...}
  isCollapsed={sidebarCollapsed}
  onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/components/chat/ConversationSidebar.tsx
git commit -m "feat: responsive sidebar collapse for small screens"
```

---

## 最终验证

- [ ] **Step 1: 运行全部测试**

Run: `pnpm test`
Expected: ALL PASSING

- [ ] **Step 2: 运行 lint**

Run: `pnpm run lint:build`
Expected: no errors

- [ ] **Step 3: 运行 ts-check**

Run: `pnpm run ts-check`
Expected: no errors

- [ ] **Step 4: 手动验证 checklist**

| # | 验证项 | 状态 |
|---|--------|------|
| 1 | Skill 名中文展示，无英文 key | ⬜ |
| 2 | 原文引用无作者/书名前缀 | ⬜ |
| 3 | 多 Skill 问题展示 2+ 个 Skill | ⬜ |
| 4 | 重新生成不重复 user 消息 | ⬜ |
| 5 | 顶栏可见清空按钮，点击确认后清空 | ⬜ |
| 6 | 左侧栏展示对话列表，支持新建/切换/删除 | ⬜ |
| 7 | 刷新页面后对话状态恢复 | ⬜ |
| 8 | 小屏幕左侧栏可折叠 | ⬜ |

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
      content: '作为开发者，我该学什么方向才能提升技术能力？',
    };

    const updated = addMessageToConversation(conv.id, userMsg);
    expect(updated.messages).toHaveLength(1);
    // 智能标题：清理标点 + 空格后，截断为前 12 字 + …
    expect(updated.title).toBe('作为开发者 我该学什么方…');
  });

  it('generateTitle extracts main idea from various inputs', () => {
    expect(generateTitle('我的项目进展很好，为什么没有产出？')).toBe('我的项目进展很好 为什么…');
    expect(generateTitle('请问提升技术的关键是什么？')).toBe('提升技术的关键');
    expect(generateTitle('遇到不懂的问题不会回答怎么处理？')).toBe('遇到不懂的问题不会回答');
    expect(generateTitle('')).toBe('新对话');
    expect(generateTitle('   ')).toBe('新对话');
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

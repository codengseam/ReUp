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
    };

    const updated = addMessageToConversation(conv.id, userMsg);
    expect(updated.messages).toHaveLength(1);
    // 智能标题：清理标点 + 空格后，截断为前 12 字 + …
    expect(updated.title).toBe('作为技术负责人 我该学什…');
  });

  it('generateTitle extracts main idea from various inputs', () => {
    expect(generateTitle('我绩效很好，为什么没晋升？')).toBe('我绩效很好 为什么没晋升');
    expect(generateTitle('请问晋升P7的关键是什么？')).toBe('晋升P7的关键');
    expect(generateTitle('面试被问住不会回答怎么圆？')).toBe('面试被问住不会回答');
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

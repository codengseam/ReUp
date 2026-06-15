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
    render(<ConversationSidebar conversations={mockConversations} currentId="1" onNewChat={() => {}} onSelectChat={() => {}} onDeleteChat={() => {}} />);
    expect(screen.getByText('新建对话')).toBeInTheDocument();
  });

  it('renders conversation list', () => {
    render(<ConversationSidebar conversations={mockConversations} currentId="1" onNewChat={() => {}} onSelectChat={() => {}} onDeleteChat={() => {}} />);
    expect(screen.getByText('对话A')).toBeInTheDocument();
    expect(screen.getByText('对话B')).toBeInTheDocument();
  });

  it('calls onSelectChat when conversation clicked', () => {
    const onSelect = vi.fn();
    render(<ConversationSidebar conversations={mockConversations} currentId="1" onNewChat={() => {}} onSelectChat={onSelect} onDeleteChat={() => {}} />);
    fireEvent.click(screen.getByText('对话B'));
    expect(onSelect).toHaveBeenCalledWith('2');
  });
});

'use client';

import { useState } from 'react';
import { Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/shared/utils/utils';
import type { Conversation } from '@/server/db/conversation-store';
import { groupConversationsByTime } from '@/server/db/conversation-store';

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

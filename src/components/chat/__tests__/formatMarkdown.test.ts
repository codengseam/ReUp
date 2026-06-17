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

  it('preserves plain text without transformation', () => {
    const input = '**调用的 Skill**: 示例技能';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('示例技能');
  });

  it('preserves citation content without book name removal (generic)', () => {
    const input = '> 这是一条参考文档的引用内容';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('参考文档');
    expect(result).toContain('引用内容');
  });

  it('preserves content without book citation', () => {
    const input = '> 这是一条普通引用，没有书名。';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('这是一条普通引用');
    expect(result).toContain('没有书名');
  });

  // ===== 阶段 4 Task 4.1：Citation 强制编号 =====
  it('renders [1] as clickable sup button with data-citation', () => {
    const input = '请参考原文 [1] 和 [2]';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('<sup>');
    expect(result).toContain('data-citation="1"');
    expect(result).toContain('data-citation="2"');
    expect(result).toContain('citation-ref');
  });

  it('renders single [1] as sup with citation-ref class', () => {
    const input = '引用见 [1]';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toMatch(/<sup><button[^>]*class="citation-ref[^"]*"[^>]*data-citation="1"[^>]*>\[1\]<\/button><\/sup>/);
  });

  it('renders [1] with data-message-id when messageId is provided', () => {
    const input = '引用 [1]';
    const result = formatMarkdown(input, mockPurify, 'msg-123');
    expect(result).toContain('data-message-id="msg-123"');
    expect(result).toContain('data-citation="1"');
  });

  it('does not render [^1] as citation (only plain [1])', () => {
    // 阶段 4 改为仅识别纯数字 [N]（不再支持 [^N] 旧角标形式）
    const input = '引用 [^1] 不应被转成 sup';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('data-citation="1"');
  });

  it('preserves [1] inside strong tag', () => {
    const input = '**重点**：[1] 提示';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('<sup>');
    expect(result).toContain('data-citation="1"');
  });

  // ===== 样式测试 =====
  it('renders quote block with styled background', () => {
    const input = '> 这是一条参考引用内容';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('bg-[#f6fef9]');
    expect(result).toContain('border-l-[3px]');
    expect(result).toContain('rounded-r-lg');
    expect(result).toContain('参考引用内容');
  });

  it('renders numbered list with circular badge', () => {
    const input = '1. 第一步：确认问题边界';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('rounded-full');
    expect(result).toContain('bg-primary-container');
    expect(result).toContain('w-6');
    expect(result).toContain('h-6');
  });
});

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

  it('removes em-dash book citation at end of quote', () => {
    const input = '> "先精通当前级别，再做下一级别的事。" —— 《大厂晋升指南》';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('《大厂晋升指南》');
    expect(result).not.toContain('——');
    expect(result).toContain('先精通当前级别');
  });

  it('removes em-dash book citation with author', () => {
    const input = '> 主动/成长/价值三原则过滤任务 —— 李运华《大厂晋升指南》';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('《大厂晋升指南》');
    expect(result).not.toContain('李运华');
    expect(result).toContain('主动/成长/价值');
  });

  it('removes em-dash book citation in inline context', () => {
    const input = '原文知识点：> "先精通当前级别，再做下一级别的事。" —— 《大厂晋升指南》';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('《大厂晋升指南》');
    expect(result).toContain('原文知识点');
  });

  it('renders skill badge with chinese name', () => {
    const input = '**调用的 Skill**: jinsheng-diceng-luoji';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('jinsheng-diceng-luoji');
    expect(result).toContain('晋升底层逻辑');
  });

  it('removes trailing book name without em-dash', () => {
    const input = '> 先精通当前级别，再做下一级别的事。《大厂晋升指南》';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('《大厂晋升指南》');
    expect(result).toContain('先精通当前级别');
  });

  it('removes other book name variations', () => {
    const input = '> 一些引文内容 —— 《进阶指南》';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('《进阶指南》');
    expect(result).toContain('一些引文内容');
  });

  it('removes multiple book citations in one message', () => {
    const input = '> 第一条引用 —— 《大厂晋升指南》\n> 第二条引用 —— 《另一本书》';
    const result = formatMarkdown(input, mockPurify);
    expect(result).not.toContain('《大厂晋升指南》');
    expect(result).not.toContain('《另一本书》');
    expect(result).toContain('第一条引用');
    expect(result).toContain('第二条引用');
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

  // ===== 方案 A：Claude 简约优雅风 样式测试 =====
  it('renders skill badge with elegant pill border (style A)', () => {
    const input = '**调用的 Skill**: jinsheng-diceng-luoji';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('border');
    expect(result).toContain('rounded-full');
    expect(result).toContain('bg-primary-container');
    expect(result).toContain('晋升底层逻辑');
  });

  it('renders quote block with f6fef9 background (style A)', () => {
    const input = '> 先精通当前级别，再做下一级别的事。';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('bg-[#f6fef9]');
    expect(result).toContain('border-l-[3px]');
    expect(result).toContain('rounded-r-lg');
    expect(result).toContain('先精通当前级别');
  });

  it('renders numbered list with circular badge (style A)', () => {
    const input = '1. 在答辩中，你认为最被质疑的环节是什么？';
    const result = formatMarkdown(input, mockPurify);
    expect(result).toContain('rounded-full');
    expect(result).toContain('bg-primary-container');
    expect(result).toContain('w-6');
    expect(result).toContain('h-6');
  });
});

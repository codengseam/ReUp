// src/components/shared/interview/__tests__/TranscriptList.test.tsx
// ReUp Phase 3 Task 3.3: TranscriptList component tests.
//
// Coverage:
//  - Empty state
//  - Single + multiple transcript rendering
//  - Search filter (company / position / question text)
//  - Result filter (passed / failed / waiting / all)
//  - Sort order (asc / desc)
//  - Item click -> onSelect
//  - Delete -> AlertDialog confirm -> onDelete

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TranscriptList from '../TranscriptList';
import type { InterviewTranscript } from '@/features/interview/transcript';

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

function makeTranscript(overrides: Partial<InterviewTranscript> = {}): InterviewTranscript {
  return {
    id: overrides.id ?? 't-1',
    company: overrides.company ?? '字节跳动',
    position: overrides.position ?? '高级前端工程师',
    round: overrides.round ?? '一面',
    questions: overrides.questions ?? [
      { question: '请介绍一下你自己', answer: '我是一名前端开发者' },
    ],
    result: overrides.result,
    rawText: overrides.rawText ?? 'raw text',
    createdAt: overrides.createdAt ?? '2026-01-15T10:00:00.000Z',
  };
}

const SAMPLE: InterviewTranscript[] = [
  makeTranscript({
    id: 't-1',
    company: '字节跳动',
    position: '高级前端工程师',
    round: '一面',
    result: '通过',
    questions: [
      { question: '请介绍 React Hooks', answer: 'Hooks 是 React 16.8 引入的特性' },
      { question: '虚拟 DOM 的原理', answer: '虚拟 DOM 是一种轻量级的 JavaScript 对象' },
    ],
    createdAt: '2026-02-01T10:00:00.000Z',
  }),
  makeTranscript({
    id: 't-2',
    company: '阿里',
    position: '全栈工程师',
    round: '二面',
    result: '未通过',
    questions: [
      { question: '微前端方案', answer: 'qiankun 是一种方案' },
    ],
    createdAt: '2026-01-10T10:00:00.000Z',
  }),
  makeTranscript({
    id: 't-3',
    company: '腾讯',
    position: '测试开发',
    round: '终面',
    result: '等待结果',
    questions: [
      { question: '性能测试方法', answer: '压测、链路追踪' },
    ],
    createdAt: '2026-01-20T10:00:00.000Z',
  }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranscriptList', () => {
  it('renders the title and total count badge', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    expect(screen.getByText('我的面经')).toBeInTheDocument();
    expect(screen.getByText('共 3 条')).toBeInTheDocument();
  });

  it('shows an empty state when the list is empty', () => {
    render(<TranscriptList transcripts={[]} />);
    expect(screen.getByTestId('transcript-list-empty')).toHaveTextContent(
      /暂无面经/,
    );
  });

  it('shows a different empty state when filters return nothing', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    const search = screen.getByTestId('transcript-list-search');
    fireEvent.change(search, { target: { value: '不存在的公司XYZ' } });
    expect(screen.getByTestId('transcript-list-empty')).toHaveTextContent(
      /没有匹配的面经/,
    );
  });

  it('renders all transcripts in the list', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    const items = screen.getAllByTestId('transcript-list-item');
    expect(items).toHaveLength(3);
    // Each item should show the company name
    expect(screen.getByText('字节跳动')).toBeInTheDocument();
    expect(screen.getByText('阿里')).toBeInTheDocument();
    expect(screen.getByText('腾讯')).toBeInTheDocument();
  });

  it('shows the question count for each transcript', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    expect(screen.getByText('2 个问题')).toBeInTheDocument();
    expect(screen.getAllByText('1 个问题')).toHaveLength(2);
  });

  it('shows result badges with correct color classes', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    expect(screen.getByText('通过')).toHaveClass('bg-emerald-100');
    expect(screen.getByText('未通过')).toHaveClass('bg-red-100');
    expect(screen.getByText('等待结果')).toHaveClass('bg-amber-100');
  });

  it('formats the createdAt date as YYYY-MM-DD', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    expect(screen.getByText('2026-02-01')).toBeInTheDocument();
    expect(screen.getByText('2026-01-10')).toBeInTheDocument();
  });

  it('sorts by createdAt desc by default (newest first)', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    const items = screen.getAllByTestId('transcript-list-item');
    // t-1 is 2026-02-01 (newest), t-3 is 2026-01-20, t-2 is 2026-01-10
    expect(within(items[0] as HTMLElement).getByText('字节跳动')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText('腾讯')).toBeInTheDocument();
    expect(within(items[2] as HTMLElement).getByText('阿里')).toBeInTheDocument();
  });

  it('filters transcripts by search keyword (company)', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    const search = screen.getByTestId('transcript-list-search');
    fireEvent.change(search, { target: { value: '阿里' } });
    const items = screen.getAllByTestId('transcript-list-item');
    expect(items).toHaveLength(1);
    expect(within(items[0] as HTMLElement).getByText('阿里')).toBeInTheDocument();
  });

  it('filters transcripts by search keyword (question content)', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    const search = screen.getByTestId('transcript-list-search');
    // The fixture contains "虚拟 DOM" (with a space) inside the answer text
    fireEvent.change(search, { target: { value: '虚拟' } });
    const items = screen.getAllByTestId('transcript-list-item');
    expect(items).toHaveLength(1);
    expect(within(items[0] as HTMLElement).getByText('字节跳动')).toBeInTheDocument();
  });

  it('clears the keyword via the X button', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    const search = screen.getByTestId('transcript-list-search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: '阿里' } });
    expect(screen.getAllByTestId('transcript-list-item')).toHaveLength(1);

    const clearBtn = screen.getByLabelText('清空搜索');
    fireEvent.click(clearBtn);
    expect(search.value).toBe('');
    expect(screen.getAllByTestId('transcript-list-item')).toHaveLength(3);
  });

  it('filters by result=passed', async () => {
    const user = userEvent.setup();
    render(<TranscriptList transcripts={SAMPLE} />);

    // Open the result filter Select
    const resultTrigger = screen.getByTestId('transcript-list-result-filter');
    await user.click(resultTrigger);
    // Click the "通过" option
    const passedOption = await screen.findByRole('option', { name: '通过' });
    await user.click(passedOption);

    const items = screen.getAllByTestId('transcript-list-item');
    expect(items).toHaveLength(1);
    expect(within(items[0] as HTMLElement).getByText('字节跳动')).toBeInTheDocument();
  });

  it('filters by result=failed', async () => {
    const user = userEvent.setup();
    render(<TranscriptList transcripts={SAMPLE} />);

    const resultTrigger = screen.getByTestId('transcript-list-result-filter');
    await user.click(resultTrigger);
    const failedOption = await screen.findByRole('option', { name: '未通过' });
    await user.click(failedOption);

    const items = screen.getAllByTestId('transcript-list-item');
    expect(items).toHaveLength(1);
    expect(within(items[0] as HTMLElement).getByText('阿里')).toBeInTheDocument();
  });

  it('switches to ascending sort and re-orders items', async () => {
    const user = userEvent.setup();
    render(<TranscriptList transcripts={SAMPLE} />);

    // Default desc: 字节(t-1) -> 腾讯(t-3) -> 阿里(t-2)
    const sortTrigger = screen.getByTestId('transcript-list-sort');
    await user.click(sortTrigger);
    const ascOption = await screen.findByRole('option', { name: '时间正序' });
    await user.click(ascOption);

    const items = screen.getAllByTestId('transcript-list-item');
    // Asc: 阿里(2026-01-10) -> 腾讯(2026-01-20) -> 字节(2026-02-01)
    expect(within(items[0] as HTMLElement).getByText('阿里')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText('腾讯')).toBeInTheDocument();
    expect(within(items[2] as HTMLElement).getByText('字节跳动')).toBeInTheDocument();
  });

  it('calls onSelect when an item body is clicked', () => {
    const onSelect = vi.fn();
    render(<TranscriptList transcripts={SAMPLE} onSelect={onSelect} />);
    const body = screen.getAllByTestId('transcript-list-item-body')[0];
    fireEvent.click(body);
    expect(onSelect).toHaveBeenCalledWith('t-1');
  });

  it('calls onSelect when the view button is clicked', () => {
    const onSelect = vi.fn();
    render(<TranscriptList transcripts={SAMPLE} onSelect={onSelect} />);
    // Default sort is desc: t-1, t-3, t-2. Click the 3rd (last) view button → t-2
    const viewBtn = screen.getAllByTestId('transcript-list-view')[2];
    fireEvent.click(viewBtn);
    expect(onSelect).toHaveBeenCalledWith('t-2');
  });

  it('expands the question list when the toggle button is clicked', () => {
    render(<TranscriptList transcripts={SAMPLE} />);
    // Initially the question content should NOT be present in the expanded view
    expect(screen.queryByText('请介绍 React Hooks')).not.toBeInTheDocument();
    // Click the first toggle
    const toggleBtn = screen.getAllByTestId('transcript-list-toggle')[0];
    fireEvent.click(toggleBtn);
    // Now the question should be visible
    expect(screen.getByText('请介绍 React Hooks')).toBeInTheDocument();
  });

  it('opens an AlertDialog and calls onDelete when confirmed', async () => {
    const onDelete = vi.fn();
    render(<TranscriptList transcripts={SAMPLE} onDelete={onDelete} />);

    const deleteBtns = screen.getAllByTestId('transcript-list-delete');
    fireEvent.click(deleteBtns[0]);

    // AlertDialog should now be open
    const confirmBtn = await screen.findByRole('button', { name: '确认删除' });
    fireEvent.click(confirmBtn);

    expect(onDelete).toHaveBeenCalledWith('t-1');
  });

  it('does NOT call onDelete when the dialog is cancelled', async () => {
    const onDelete = vi.fn();
    render(<TranscriptList transcripts={SAMPLE} onDelete={onDelete} />);

    const deleteBtns = screen.getAllByTestId('transcript-list-delete');
    fireEvent.click(deleteBtns[0]);

    const cancelBtn = await screen.findByRole('button', { name: '取消' });
    fireEvent.click(cancelBtn);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('renders the loading hint when loading=true', () => {
    render(<TranscriptList transcripts={[]} loading={true} />);
    expect(screen.getByTestId('transcript-list-loading')).toBeInTheDocument();
  });

  it('renders the error hint when error is provided', () => {
    render(<TranscriptList transcripts={[]} error={'网络错误'} />);
    expect(screen.getByTestId('transcript-list-error')).toHaveTextContent('网络错误');
  });

  it('handles a single transcript with no questions', () => {
    const only = [makeTranscript({ id: 'solo', questions: [] })];
    render(<TranscriptList transcripts={only} />);
    expect(screen.getByTestId('transcript-list-item')).toBeInTheDocument();
    expect(screen.getByText('0 个问题')).toBeInTheDocument();
  });

  it('shows the company fallback "未知公司" when company is missing', () => {
    // Note: do NOT use makeTranscript() here because it defaults `company` to
    // "字节跳动". We need to construct the transcript with `company: undefined`
    // explicitly.
    const noCompany: InterviewTranscript = {
      id: 'nc',
      position: '高级前端工程师',
      round: '一面',
      questions: [{ question: 'Q1', answer: 'A1' }],
      rawText: '',
      createdAt: '2026-01-15T10:00:00.000Z',
    };
    render(<TranscriptList transcripts={[noCompany]} />);
    const item = screen.getByTestId('transcript-list-item');
    const span = within(item).getByText(/^未知公司$/);
    expect(span).toBeInTheDocument();
  });
});

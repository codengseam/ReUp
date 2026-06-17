// src/components/shared/resume/__tests__/RewriteDiff.test.tsx
// ReUp Phase 2 (Task 2.2): RewriteDiff visual component tests.
//
// Coverage:
//  1) Empty changes → renders the empty-state placeholder
//  2) Single-section change → renders that tab + the reason banner
//  3) Multi-section changes → all three tabs are clickable and switch
//  4) before lines are visually de-emphasised, after lines highlighted

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RewriteDiff } from '../RewriteDiff';
import type { RewriteChange } from '@/features/resume/rewriter/contextual-rewriter';

/** Return the visible (data-state=active) Radix TabsContent element. */
function activeTabContent(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[role="tabpanel"][data-state="active"]');
  if (!el) throw new Error('No active tab panel found');
  return el as HTMLElement;
}

const expChange: RewriteChange = {
  section: '工作经历',
  before: 'Old bullet A\nOld bullet B',
  after: '*Situation* new context\n*Action* rewrote everything',
  reason: '基于匹配差距和诊断问题，用 STAR 法则重写工作经历',
};

const projChange: RewriteChange = {
  section: '项目经历',
  before: 'Old project',
  after: '*Situation* new project',
  reason: '基于匹配差距和诊断问题，用 STAR 法则重写项目经历',
};

const skillChange: RewriteChange = {
  section: '技能列表',
  before: 'Java, MySQL',
  after: 'Java, Spring Cloud, Kubernetes',
  reason: '基于 JD 需求优化技能列表',
};

describe('RewriteDiff', () => {
  it('renders empty state when changes is empty', () => {
    render(<RewriteDiff changes={[]} />);
    expect(screen.getByText(/暂无改写结果/)).toBeInTheDocument();
  });

  it('renders the reason banner for a single-section change', () => {
    render(<RewriteDiff changes={[expChange]} />);
    expect(screen.getByText(/改写理由/)).toBeInTheDocument();
    expect(screen.getByText(expChange.reason)).toBeInTheDocument();
  });

  it('marks the original lines with line-through (removed style)', () => {
    render(<RewriteDiff changes={[expChange]} />);
    const removed = screen.getAllByText('Old bullet A')[0]!;
    expect(removed.closest('li')).toHaveClass('line-through');
  });

  it('highlights the rewritten lines with a green background (added style)', () => {
    const { container } = render(<RewriteDiff changes={[expChange]} />);
    const addedItems = container.querySelectorAll('li.bg-emerald-50');
    expect(addedItems.length).toBeGreaterThan(0);
  });

  it('renders multiple tabs for multi-section changes', () => {
    render(<RewriteDiff changes={[expChange, projChange, skillChange]} />);
    expect(screen.getByRole('tab', { name: /工作经历/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /项目经历/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /技能列表/ })).toBeInTheDocument();
  });

  it('switches content when clicking a different tab', async () => {
    const user = userEvent.setup();
    const { container } = render(<RewriteDiff changes={[expChange, projChange, skillChange]} />);

    // Initially shows the experience reason
    expect(activeTabContent(container)).toHaveTextContent(expChange.reason);

    // Click the projects tab and verify reason changes
    await user.click(screen.getByRole('tab', { name: /项目经历/ }));
    expect(activeTabContent(container)).toHaveTextContent(projChange.reason);
    expect(activeTabContent(container)).not.toHaveTextContent(expChange.reason);

    // Click the skills tab
    await user.click(screen.getByRole('tab', { name: /技能列表/ }));
    expect(activeTabContent(container)).toHaveTextContent(skillChange.reason);
    expect(activeTabContent(container)).toHaveTextContent('Kubernetes');
  });

  it('disables tabs that have no corresponding changes', () => {
    render(<RewriteDiff changes={[expChange]} />);
    const projectsTab = screen.getByRole('tab', { name: /项目经历/ });
    expect(projectsTab).toBeDisabled();
  });

  it('renders a section change count badge on tabs that have content', () => {
    render(<RewriteDiff changes={[expChange, projChange, skillChange]} />);
    // Each tab should render its count in parens
    const expTab = screen.getByRole('tab', { name: /工作经历/ });
    expect(within(expTab).getByText('(1)')).toBeInTheDocument();
  });

  it('renders the same component as a no-op when the user passes duplicate sections without crashing', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RewriteDiff changes={[expChange, expChange]} />);
    expect(screen.getByText(expChange.reason)).toBeInTheDocument();
    errSpy.mockRestore();
  });
});

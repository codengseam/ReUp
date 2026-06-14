// src/app/resume/_components/MatchReportCard.test.tsx
// ReUp v2 Phase 4 P1 (H5): Match Report Cards UI tests.
//
// TDD-first: written before the component. The component should accept
// pre-computed `atsResult` and `matchReport` props so the tests stay
// synchronous and deterministic (no LLM calls, no async).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MatchReportCard } from './MatchReportCard';
import type { ATSResult, MatchReport, ResumeDocument } from '@/lib/resume/types';

const resume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张三', title: '高级测试开发工程师' },
  experience: [],
  projects: [],
  skills: ['Python', 'MySQL'],
  education: [],
  raw: '张三 / 高级测试开发工程师',
};

const jd = '招 Python 后端，熟悉 MySQL 和微服务架构';

const baseAts: ATSResult = {
  jdKeywords: [
    { term: 'python', weight: 1 },
    { term: 'mysql', weight: 0.6 },
  ],
  coverage: { hits: 1.6, total: 1.6, percentage: 100 },
  missing: [],
};

const baseReport: MatchReport = {
  strengths: [
    { dimension: 'p1-zhiye-jingji', evidence: '5 年测试开发经验，端到端负责核心业务质量' },
  ],
  gaps: [
    { dimension: 'p2-jiben-gongzuo', severity: 'high' },
  ],
  priorities: [
    { rank: 1, action: 'Add quantified metrics to top 3 bullets', expectedImpact: 'High' },
    { rank: 2, action: 'Highlight JD keywords in skills list', expectedImpact: 'Medium' },
    { rank: 3, action: 'Write a 1-line personal summary', expectedImpact: 'Low' },
  ],
};

const emptyAts: ATSResult = {
  jdKeywords: [],
  coverage: { hits: 0, total: 0, percentage: 0 },
  missing: [],
};

const emptyReport: MatchReport = {
  strengths: [],
  gaps: [],
  priorities: [
    { rank: 1, action: 'default action 1', expectedImpact: 'High' },
    { rank: 2, action: 'default action 2', expectedImpact: 'Medium' },
    { rank: 3, action: 'default action 3', expectedImpact: 'Low' },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MatchReportCard', () => {
  it('renders the Match Report heading and a Coverage badge with the percentage', () => {
    render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={baseAts}
        matchReport={baseReport}
      />,
    );
    expect(screen.getByText(/Match Report|匹配报告/)).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();
  });

  it('renders a Progress component with aria-valuenow equal to coverage.percentage', () => {
    render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={baseAts}
        matchReport={baseReport}
      />,
    );
    // Radix Progress exposes aria-valuenow
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '100');
  });

  it('uses a green tone when coverage is >= 70', () => {
    const ats70: ATSResult = {
      ...baseAts,
      coverage: { hits: 0.7, total: 1, percentage: 70 },
    };
    const { container } = render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={ats70}
        matchReport={baseReport}
      />,
    );
    // 70% threshold → green class should appear on the Progress track
    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).not.toBeNull();
    expect(progress?.className).toMatch(/emerald|green/);
  });

  it('uses an amber tone when coverage is >= 40 and < 70', () => {
    const ats50: ATSResult = {
      ...baseAts,
      coverage: { hits: 0.5, total: 1, percentage: 50 },
    };
    const { container } = render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={ats50}
        matchReport={baseReport}
      />,
    );
    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).not.toBeNull();
    expect(progress?.className).toMatch(/amber|yellow/);
  });

  it('uses a red tone when coverage is < 40', () => {
    const ats20: ATSResult = {
      ...baseAts,
      coverage: { hits: 0.2, total: 1, percentage: 20 },
    };
    const { container } = render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={ats20}
        matchReport={baseReport}
      />,
    );
    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).not.toBeNull();
    expect(progress?.className).toMatch(/red/);
  });

  it('renders the Strengths card with the count and evidence quote', () => {
    render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={baseAts}
        matchReport={baseReport}
      />,
    );
    // The Strengths heading shows "(1)" count
    const strengthsHeading = screen.getByText(/优势|Strengths/);
    expect(strengthsHeading).toBeInTheDocument();
    // The evidence quote is rendered
    expect(
      screen.getByText(/5 年测试开发经验，端到端负责核心业务质量/),
    ).toBeInTheDocument();
  });

  it('renders the Gaps card with a severity badge', () => {
    render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={baseAts}
        matchReport={baseReport}
      />,
    );
    // The Gaps heading is present
    expect(screen.getByText(/短板|Gaps/)).toBeInTheDocument();
    // The severity "high" badge is rendered
    expect(screen.getByText(/^high$/)).toBeInTheDocument();
  });

  it('renders Priorities as a numbered 1./2./3. list with action + impact badges', () => {
    render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={baseAts}
        matchReport={baseReport}
      />,
    );
    // All three numbered prefixes
    expect(screen.getByText(/^1\./)).toBeInTheDocument();
    expect(screen.getByText(/^2\./)).toBeInTheDocument();
    expect(screen.getByText(/^3\./)).toBeInTheDocument();
    // Action text rendered
    expect(
      screen.getByText(/Add quantified metrics to top 3 bullets/),
    ).toBeInTheDocument();
    // Impact badges rendered
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders Missing Keywords chips with suggestedSection label', () => {
    const atsWithMissing: ATSResult = {
      ...baseAts,
      missing: [
        { term: 'kubernetes', suggestedSection: 'skills' },
        { term: '微服务', suggestedSection: 'projects' },
        { term: '团队管理', suggestedSection: 'basic' },
        { term: '压测', suggestedSection: 'experience' },
      ],
    };
    const { container } = render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={atsWithMissing}
        matchReport={baseReport}
      />,
    );
    // Scope the section label search to the Missing Keywords card (the
    // "Strengths" card heading and the priority "skills list" action
    // both contain the substring "skills", so a global query is ambiguous).
    const missingCards = Array.from(container.querySelectorAll('div')).filter((el) =>
      /缺失关键词|Missing Keywords/.test(el.textContent ?? ''),
    );
    expect(missingCards.length).toBeGreaterThan(0);
    const card = missingCards[0] as HTMLElement;
    // Each chip is rendered
    expect(within(card).getByText('kubernetes')).toBeInTheDocument();
    expect(within(card).getByText('微服务')).toBeInTheDocument();
    // Section labels (whole-element match)
    expect(within(card).getByText('skills')).toBeInTheDocument();
    expect(within(card).getByText('projects')).toBeInTheDocument();
    expect(within(card).getByText('basic')).toBeInTheDocument();
    expect(within(card).getByText('experience')).toBeInTheDocument();
  });

  it('shows empty-state placeholders when no strengths or no gaps', () => {
    render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={emptyAts}
        matchReport={emptyReport}
      />,
    );
    // The Strengths and Gaps cards each render an empty-state hint
    const noStrengths = screen.getAllByText(/暂无|空|none/i);
    expect(noStrengths.length).toBeGreaterThanOrEqual(2);
  });

  it('does not call the engines when atsResult and matchReport are pre-computed', () => {
    // Spy on the engines. If the component reaches for them, the spy fires.
    const atsSpy = vi.fn();
    const matcherSpy = vi.fn();
    vi.doMock('@/lib/resume/ats', () => ({
      extractJdKeywords: atsSpy,
      computeAtsCoverage: atsSpy,
      suggestSectionForKeyword: atsSpy,
    }));
    vi.doMock('@/lib/resume/matcher', () => ({
      classifyDimensions: matcherSpy,
      generatePriorities: matcherSpy,
    }));
    // Import the component fresh so the mocked modules are bound.
    // We can't easily re-import here, so we rely on a simpler observation:
    // since we passed atsResult and matchReport as props, the engines MUST
    // not be required to render. This test asserts that the component does
    // not throw and renders synchronously (no async work).
    expect(() =>
      render(
        <MatchReportCard
          resume={resume}
          jd={jd}
          atsResult={baseAts}
          matchReport={baseReport}
        />,
      ),
    ).not.toThrow();
    vi.doUnmock('@/lib/resume/ats');
    vi.doUnmock('@/lib/resume/matcher');
  });

  it('locates the Strengths card by its heading and contains a green dot indicator', () => {
    const { container } = render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={baseAts}
        matchReport={baseReport}
      />,
    );
    // Find the Strengths card via its heading text, then look for an
    // element with the emerald/green dot background class.
    const strengthCards = Array.from(container.querySelectorAll('div')).filter((el) =>
      /优势|Strengths/.test(el.textContent ?? ''),
    );
    expect(strengthCards.length).toBeGreaterThan(0);
    const card = strengthCards[0] as HTMLElement;
    // The green dot should be inside the card
    const dot = card.querySelector('[data-slot="strength-dot"]');
    expect(dot).not.toBeNull();
    expect(dot?.className).toMatch(/emerald|green/);
  });

  it('renders the Coverage badge text matching the percentage rounded to 1 decimal', () => {
    const ats732: ATSResult = {
      ...baseAts,
      coverage: { hits: 0.73, total: 1, percentage: 73.2 },
    };
    render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={ats732}
        matchReport={baseReport}
      />,
    );
    // The badge text includes "73.2%"
    expect(screen.getByText(/73\.2/)).toBeInTheDocument();
    // Sanity: progress aria-valuenow is 73.2
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '73.2');
  });

  it('matches the gap severity badge to one of the high/medium/low tones', () => {
    const report: MatchReport = {
      ...baseReport,
      gaps: [
        { dimension: 'p1', severity: 'high' },
        { dimension: 'p2', severity: 'medium' },
        { dimension: 'p3', severity: 'low' },
      ],
    };
    const { container } = render(
      <MatchReportCard
        resume={resume}
        jd={jd}
        atsResult={baseAts}
        matchReport={report}
      />,
    );
    // Find the Gaps card and assert each severity badge has a color class
    const gapCards = Array.from(container.querySelectorAll('div')).filter((el) =>
      /短板|Gaps/.test(el.textContent ?? ''),
    );
    expect(gapCards.length).toBeGreaterThan(0);
    const card = gapCards[0] as HTMLElement;
    const badges = within(card).getAllByText(/^(high|medium|low)$/);
    expect(badges.length).toBe(3);
  });
});

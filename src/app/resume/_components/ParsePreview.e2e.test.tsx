// src/app/resume/_components/ParsePreview.e2e.test.tsx
// ReUp v2 Phase 6 (B3): end-to-end test that the ParsePreview component
// renders all 5 sections correctly when fed a ResumeDocument produced by
// the parser on the real fixture file. Guards against future regressions
// in either the parser or the preview.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { ParsePreview } from './ParsePreview';
import { parseMdResume } from '@/features/resume/parser-md';

const FIXTURE_PATH = join(process.cwd(), 'data/user-samples/resume/简历.md');

describe('ParsePreview end-to-end (resume-parse-jd-prompts B3)', () => {
  it('renders all 5 sections from the real fixture', () => {
    const md = readFileSync(FIXTURE_PATH, 'utf8');
    const doc = parseMdResume(md);
    const { container } = render(<ParsePreview resume={doc} />);

    // Section labels: "工作经历 (3)", "项目经历 (3)", "技能 (18)", "教育经历 (1)"
    expect(within(container).getByText(/工作经历 \(3\)/)).toBeInTheDocument();
    expect(within(container).getByText(/项目经历 \(3\)/)).toBeInTheDocument();
    expect(within(container).getByText(/技能 \(9\)/)).toBeInTheDocument();
    expect(within(container).getByText(/教育经历 \(1\)/)).toBeInTheDocument();

    // Companies from experience
    expect(within(container).getByText('字节跳动')).toBeInTheDocument();
    expect(within(container).getByText('K12 - 智慧考试')).toBeInTheDocument();
    expect(within(container).getByText('科大讯飞')).toBeInTheDocument();

    // A project name from the fixed parser
    expect(within(container).getByText('个人 AI 实践项目')).toBeInTheDocument();
  });

  it('shows EmptyHint when a section has no entries (all 4 placeholder types)', () => {
    const emptyDoc = {
      meta: { version: 'reup.v2.phase3', source: 'text' as const, createdAt: '2026-01-15T00:00:00.000Z' },
      basic: { name: '测试' },
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: '测试',
    };
    render(<ParsePreview resume={emptyDoc} />);
    expect(screen.getByTestId('empty-hint-工作经历')).toBeInTheDocument();
    expect(screen.getByTestId('empty-hint-项目经历')).toBeInTheDocument();
    expect(screen.getByTestId('empty-hint-技能')).toBeInTheDocument();
    expect(screen.getByTestId('empty-hint-教育经历')).toBeInTheDocument();
  });

  it('renders education notes when present (A5)', () => {
    const doc = {
      meta: { version: 'reup.v2.phase3', source: 'text' as const, createdAt: '2026-01-15T00:00:00.000Z' },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [
        {
          school: '石河子大学',
          degree: '软件工程 本科',
          period: '2016年09月 - 2020年07月',
          notes: ['相关课程：数据库原理、软件工程', '专业成绩前5%'],
        },
      ],
      raw: '',
    };
    render(<ParsePreview resume={doc} />);
    expect(screen.getByText(/相关课程/)).toBeInTheDocument();
    expect(screen.getByText(/专业成绩前5%/)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import FrameworkSkillsTab from './framework-skills-tab';
import type { FrameworkSkill } from '@/server/db/admin-knowledge';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// 手摇 mock 数据：2 个 skill（1 晋升 + 1 面试），让测试跑得快
const MOCK_SKILLS: FrameworkSkill[] = [
  {
    id: 'jinsheng-dicing-luoji',
    name: '晋升底层逻辑',
    category: 'promotion',
    trigger: '我绩效很好，为什么没晋升？',
    framework: '先精通当前级别，再做下一级别的事',
    steps: ['确认晋升通道', '评估当前级别', '对标下一级', '寻找越级机会'],
    markdown: '# 晋升底层逻辑\n\n## 心法\n\n- 长期主义\n- 跨级别思考',
    markdownPath: '/abs/path/skills/jinsheng-dicing-luoji/SKILL.md',
  },
  {
    id: 'highlight-extractor',
    name: '亮点挖掘',
    category: 'interview',
    trigger: '简历没亮点怎么办？',
    framework: '价值/结果/创新/动机四维挖掘',
    steps: ['输入平淡经历', '价值与结果榨取', '创新与动机榨取', '生成亮点句'],
    markdown: '## 亮点挖掘\n\n### 输入\n\n平淡的项目经历',
    markdownPath: '/abs/path/skills/highlight-extractor/SKILL.md',
  },
];

function buildFetchMock(impl?: typeof fetch) {
  return vi.fn().mockImplementation(impl ?? (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ skills: MOCK_SKILLS }),
  } as Response)));
}

describe('FrameworkSkillsTab', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
    vi.restoreAllMocks();
  });

  it('(a) 初次渲染时显示 loading 状态', () => {
    // 让 fetch 永远 pending，组件 mount 后停留在 loading=true
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ }));

    render(<FrameworkSkillsTab />);
    // 顶部「总 Skill 数」统计卡 loading 时显示 '-'
    const totalStat = screen.getByTestId('stat-total');
    expect(totalStat.textContent).toContain('-');
    // 加载 Skill 列表... 占位文字
    expect(screen.getAllByText('加载 Skill 列表...').length).toBeGreaterThan(0);
  });

  it('(b) fetch 完成后渲染 2 个 skill 名称', async () => {
    globalThis.fetch = buildFetchMock();

    render(<FrameworkSkillsTab />);
    // 等待异步 fetch 完成
    await waitFor(() => {
      expect(screen.getByText('晋升底层逻辑')).toBeInTheDocument();
    });
    expect(screen.getByText('亮点挖掘')).toBeInTheDocument();
    // 数据来源是 MOCK_SKILLS，包含 2 个
    expect(screen.getByTestId('skill-card-jinsheng-dicing-luoji')).toBeInTheDocument();
    expect(screen.getByTestId('skill-card-highlight-extractor')).toBeInTheDocument();
  });

  it('(c) 统计卡显示正确的数量（mock 数据 2 个）', async () => {
    globalThis.fetch = buildFetchMock();

    render(<FrameworkSkillsTab />);
    await waitFor(() => {
      expect(screen.getByTestId('stat-total').textContent).toContain('2');
    });
    const totalStat = screen.getByTestId('stat-total');
    const promotionStat = screen.getByTestId('stat-promotion');
    const interviewStat = screen.getByTestId('stat-interview');
    expect(totalStat.textContent).toMatch(/2\s*个/);
    expect(promotionStat.textContent).toMatch(/1\s*个/);
    expect(interviewStat.textContent).toMatch(/1\s*个/);
  });

  it('(d) 点击卡片展开 SKILL.md markdown 内容', async () => {
    globalThis.fetch = buildFetchMock();

    render(<FrameworkSkillsTab />);
    const card = await waitFor(() => screen.getByTestId('skill-card-jinsheng-dicing-luoji'));
    // 展开前 markdown 容器不应存在
    expect(screen.queryByTestId('skill-markdown-jinsheng-dicing-luoji')).toBeNull();
    fireEvent.click(card);
    // 展开后渲染 markdown
    await waitFor(() => {
      expect(screen.getByTestId('skill-markdown-jinsheng-dicing-luoji')).toBeInTheDocument();
    });
    // markdown 容器里出现「晋升底层逻辑」（# 标题被渲染为 h1）
    const md = screen.getByTestId('skill-markdown-jinsheng-dicing-luoji');
    expect(md.textContent).toContain('晋升底层逻辑');
    expect(md.textContent).toContain('心法');
  });

  it('(e) 再次点击同一张卡片收起 markdown', async () => {
    globalThis.fetch = buildFetchMock();

    render(<FrameworkSkillsTab />);
    const card = await waitFor(() => screen.getByTestId('skill-card-highlight-extractor'));
    fireEvent.click(card);
    await waitFor(() => {
      expect(screen.getByTestId('skill-markdown-highlight-extractor')).toBeInTheDocument();
    });
    fireEvent.click(card);
    await waitFor(() => {
      expect(screen.queryByTestId('skill-markdown-highlight-extractor')).toBeNull();
    });
  });

  it('(e2) 点击「刷新」按钮重新触发 fetch', async () => {
    const mockFetch = buildFetchMock();
    globalThis.fetch = mockFetch;

    render(<FrameworkSkillsTab />);
    // 首次 mount 自动 fetch 一次
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    // 找到「刷新」按钮
    const refreshBtn = screen.getByRole('button', { name: /刷新/ });
    fireEvent.click(refreshBtn);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('(f) fetch 失败时显示错误提示', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: '服务器内部错误' }),
    } as unknown as Response);

    render(<FrameworkSkillsTab />);
    // 错误信息会在 fetch 完成后渲染
    await waitFor(() => {
      expect(screen.getByText('服务器内部错误')).toBeInTheDocument();
    });
  });
});

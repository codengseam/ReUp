import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import FrameworkSkillsTab from './framework-skills-tab';
import type { FrameworkSkill } from '@/lib/admin-knowledge';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// 手摇 mock 数据：2 个 skill，让测试跑得快
const MOCK_SKILLS: FrameworkSkill[] = [
  {
    id: 'example-skill-a',
    name: '示例 Skill 一',
    category: 'alpha',
    trigger: '示例触发问题一？',
    framework: '示例框架一：先打基础，再做扩展',
    steps: ['步骤一', '步骤二', '步骤三', '步骤四'],
    markdown: '# 示例 Skill 一\n\n## 心法\n\n- 长期主义\n- 跨阶段思考',
    markdownPath: '/abs/path/skills/example-skill-a/SKILL.md',
  },
  {
    id: 'example-skill-b',
    name: '示例 Skill 二',
    category: 'beta',
    trigger: '示例触发问题二？',
    framework: '示例框架二：四维挖掘',
    steps: ['输入素材', '提取要点', '归纳结构', '生成结论'],
    markdown: '## 示例 Skill 二\n\n### 输入\n\n平淡的素材',
    markdownPath: '/abs/path/skills/example-skill-b/SKILL.md',
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
      expect(screen.getByText('示例 Skill 一')).toBeInTheDocument();
    });
    expect(screen.getByText('示例 Skill 二')).toBeInTheDocument();
    // 数据来源是 MOCK_SKILLS，包含 2 个
    expect(screen.getByTestId('skill-card-example-skill-a')).toBeInTheDocument();
    expect(screen.getByTestId('skill-card-example-skill-b')).toBeInTheDocument();
  });

  it('(c) 统计卡显示正确的数量（mock 数据 2 个）', async () => {
    globalThis.fetch = buildFetchMock();

    render(<FrameworkSkillsTab />);
    await waitFor(() => {
      expect(screen.getByTestId('stat-total').textContent).toContain('2');
    });
    const totalStat = screen.getByTestId('stat-total');
    const mdStat = screen.getByTestId('stat-md');
    expect(totalStat.textContent).toMatch(/2\s*个/);
    expect(mdStat.textContent).toMatch(/2\/2/);
  });

  it('(d) 点击卡片展开 SKILL.md markdown 内容', async () => {
    globalThis.fetch = buildFetchMock();

    render(<FrameworkSkillsTab />);
    const card = await waitFor(() => screen.getByTestId('skill-card-example-skill-a'));
    // 展开前 markdown 容器不应存在
    expect(screen.queryByTestId('skill-markdown-example-skill-a')).toBeNull();
    fireEvent.click(card);
    // 展开后渲染 markdown
    await waitFor(() => {
      expect(screen.getByTestId('skill-markdown-example-skill-a')).toBeInTheDocument();
    });
    // markdown 容器里出现「示例 Skill 一」（# 标题被渲染为 h1）
    const md = screen.getByTestId('skill-markdown-example-skill-a');
    expect(md.textContent).toContain('示例 Skill 一');
    expect(md.textContent).toContain('心法');
  });

  it('(e) 再次点击同一张卡片收起 markdown', async () => {
    globalThis.fetch = buildFetchMock();

    render(<FrameworkSkillsTab />);
    const card = await waitFor(() => screen.getByTestId('skill-card-example-skill-b'));
    fireEvent.click(card);
    await waitFor(() => {
      expect(screen.getByTestId('skill-markdown-example-skill-b')).toBeInTheDocument();
    });
    fireEvent.click(card);
    await waitFor(() => {
      expect(screen.queryByTestId('skill-markdown-example-skill-b')).toBeNull();
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

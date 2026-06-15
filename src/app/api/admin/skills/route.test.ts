// src/app/api/admin/skills/route.test.ts
// ReUp v2 Phase 2C：admin "Skill 框架" 接口测试。
//
// 策略：mock @/lib/admin-knowledge（控制 getFrameworkSkills 返回值），
// mock next/headers 的 cookies()（控制是否带 cookie），mock @/lib/admin-auth
// 的 verifyCookie（控制签名是否通过）。这样不依赖真实 SESSION_SECRET 和真实
// skills/<id>/SKILL.md 文件，专注测试路由层的鉴权 + 数据透传。

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------- Mocks (hoisted before imports) ----------------

const {
  mockGetFrameworkSkills,
  mockVerifyCookie,
  mockCookieStore,
} = vi.hoisted(() => ({
  mockGetFrameworkSkills: vi.fn(),
  mockVerifyCookie: vi.fn(),
  mockCookieStore: { get: vi.fn() },
}));

vi.mock('@/lib/admin-knowledge', () => ({
  getFrameworkSkills: mockGetFrameworkSkills,
}));

vi.mock('@/lib/admin-auth', () => ({
  verifyCookie: mockVerifyCookie,
}));

vi.mock('next/headers', () => ({
  cookies: () => mockCookieStore,
}));

// ---------------- Imports (must come after vi.mock) ----------------

import { GET } from './route';

function fakeSkill(overrides: Partial<{
  id: string;
  name: string;
  category: 'promotion' | 'interview';
  trigger: string;
  framework: string;
  steps: string[];
  markdown: string | null;
  markdownPath: string | null;
}> = {}) {
  return {
    id: 'jinsheng-dicing-luoji',
    name: '晋升底层逻辑',
    category: 'promotion' as const,
    trigger: '我绩效很好，为什么没晋升？',
    framework: '先精通当前级别，再做下一级别的事',
    steps: ['确认晋升通道', '评估当前级别', '对标下一级', '寻找越级机会'],
    markdown: '# 晋升底层逻辑\n\n## 触发场景\n用户绩效很好但没晋升。\n\n## 框架\n先精通当前级别。\n',
    markdownPath: '/abs/path/skills/jinsheng-dicing-luoji/SKILL.md',
    ...overrides,
  };
}

describe('GET /api/admin/skills', () => {
  beforeEach(() => {
    mockGetFrameworkSkills.mockReset();
    mockVerifyCookie.mockReset();
    mockCookieStore.get.mockReset();
  });

  it('(a) 401 when no cookie is present', async () => {
    mockCookieStore.get.mockReturnValueOnce(undefined);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
    // 鉴权失败时不应触达数据层
    expect(mockGetFrameworkSkills).not.toHaveBeenCalled();
  });

  it('returns 401 when cookie value fails HMAC verification', async () => {
    mockCookieStore.get.mockReturnValueOnce({ value: 'tampered-cookie-value' });
    mockVerifyCookie.mockReturnValueOnce(false);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
    expect(mockVerifyCookie).toHaveBeenCalledWith('tampered-cookie-value', expect.any(String));
    expect(mockGetFrameworkSkills).not.toHaveBeenCalled();
  });

  it('(b) 200 returns the 8 framework skills with markdown content', async () => {
    // 8 个 Skill（按 data/skills.json 实际数量）
    const eight = [
      fakeSkill({ id: 'jinsheng-dicing-luoji', name: '晋升底层逻辑', category: 'promotion' }),
      fakeSkill({ id: 'jinsheng-san-yuanze', name: '晋升三大原则', category: 'promotion' }),
      fakeSkill({ id: 'nengli-sanzhong-jingjie', name: '能力三重境界', category: 'promotion' }),
      fakeSkill({ id: 'p8-lingyu-zhuanjia', name: '领域专家演进', category: 'promotion' }),
      fakeSkill({ id: 'competency-model-alignment', name: '素质模型对齐', category: 'interview' }),
      fakeSkill({ id: 'highlight-extractor', name: '亮点挖掘', category: 'interview' }),
      fakeSkill({ id: 'blind-spot-navigation', name: '盲区导航', category: 'interview' }),
      fakeSkill({ id: 'reverse-questioning-framework', name: '反问框架', category: 'interview' }),
    ];
    mockCookieStore.get.mockReturnValueOnce({ value: 'valid-cookie' });
    mockVerifyCookie.mockReturnValueOnce(true);
    mockGetFrameworkSkills.mockResolvedValueOnce(eight);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills).toHaveLength(8);
  });

  it('(c) each skill has id, name, category, trigger, framework, steps, markdown, markdownPath', async () => {
    const one = [fakeSkill()];
    mockCookieStore.get.mockReturnValueOnce({ value: 'valid-cookie' });
    mockVerifyCookie.mockReturnValueOnce(true);
    mockGetFrameworkSkills.mockResolvedValueOnce(one);

    const res = await GET();
    const body = await res.json();
    const s = body.skills[0];

    expect(typeof s.id).toBe('string');
    expect(s.id.length).toBeGreaterThan(0);
    expect(typeof s.name).toBe('string');
    expect(s.name.length).toBeGreaterThan(0);
    expect(['promotion', 'interview']).toContain(s.category);
    expect(typeof s.trigger).toBe('string');
    expect(s.trigger.length).toBeGreaterThan(0);
    expect(typeof s.framework).toBe('string');
    expect(s.framework.length).toBeGreaterThan(0);
    expect(Array.isArray(s.steps)).toBe(true);
    expect(s.steps.length).toBeGreaterThan(0);
    for (const step of s.steps) {
      expect(typeof step).toBe('string');
      expect(step.length).toBeGreaterThan(0);
    }
    // markdown / markdownPath 字段存在（值可为 null）
    expect('markdown' in s).toBe(true);
    expect('markdownPath' in s).toBe(true);
  });

  it('(d) skills[0].markdown is non-null and contains markdown headings', async () => {
    const one = [fakeSkill({
      markdown: '# 晋升底层逻辑\n\n## 触发场景\n绩效好但未晋升。\n\n## 框架步骤\n1. 评估当前级别\n2. 对标下一级\n',
    })];
    mockCookieStore.get.mockReturnValueOnce({ value: 'valid-cookie' });
    mockVerifyCookie.mockReturnValueOnce(true);
    mockGetFrameworkSkills.mockResolvedValueOnce(one);

    const res = await GET();
    const body = await res.json();
    const s = body.skills[0];
    expect(s.markdown).not.toBeNull();
    expect(typeof s.markdown).toBe('string');
    // 至少包含一个 markdown 标题
    expect(s.markdown).toMatch(/^#{1,6}\s/m);
    // 包含 Skill 关键词（中文）
    expect(s.markdown).toContain('晋升');
    // markdownPath 是字符串或 null
    if (s.markdownPath !== null) {
      expect(typeof s.markdownPath).toBe('string');
      expect(s.markdownPath.length).toBeGreaterThan(0);
    }
  });

  it('500 with Chinese error message when getFrameworkSkills throws', async () => {
    mockCookieStore.get.mockReturnValueOnce({ value: 'valid-cookie' });
    mockVerifyCookie.mockReturnValueOnce(true);
    mockGetFrameworkSkills.mockRejectedValueOnce(new Error('boom'));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('获取框架 Skill 失败');
    expect(body.error).toContain('boom');
  });
});

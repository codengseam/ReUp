// skills-loader 单测
// 验证 data/skills.json 启动加载、schema 校验、对外 API
//
// 通用化版本：data/skills.json 仅含 1 个示例 Skill，hotQueries/quickEntries/suggestions 为空。

import { describe, it, expect, beforeAll } from 'vitest';
import { loadSkills, getHotQueries, getSkillById, getAllSkills, getQuickEntries, getSuggestions } from '@/lib/skills-loader';

describe('skills-loader', () => {
  beforeAll(async () => {
    await loadSkills();
  });

  it('loads 1 example skill from data/skills.json', () => {
    expect(getAllSkills().length).toBe(1);
  });

  it('loads 0 hot queries (empty in generic template)', () => {
    expect(getHotQueries().length).toBe(0);
  });

  it('loads 0 quick entries (empty in generic template)', () => {
    expect(getQuickEntries().length).toBe(0);
  });

  it('loads 0 suggestions (empty in generic template)', () => {
    expect(getSuggestions().length).toBe(0);
  });

  it('finds skill by id (示例技能)', () => {
    const s = getSkillById('example-skill');
    expect(s).toBeDefined();
    expect(s?.name).toBe('示例技能');
    expect(s?.category).toBe('general');
  });

  it('returns undefined for unknown skill id', () => {
    const s = getSkillById('not-a-real-skill');
    expect(s).toBeUndefined();
  });
});

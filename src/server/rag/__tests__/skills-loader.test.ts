// 阶段 3：skills-loader 单测（RED → GREEN）
// 验证 data/skills.json 启动加载、schema 校验、对外 API

import { describe, it, expect, beforeAll } from 'vitest';
import { loadSkills, getHotQueries, getSkillById, getAllSkills, getQuickEntries, getSuggestions } from '@/server/rag/skills-loader';

describe('skills-loader', () => {
  beforeAll(async () => {
    await loadSkills();
  });

  it('loads 8 skills from data/skills.json', () => {
    expect(getAllSkills().length).toBe(8);
  });

  it('loads 14 hot queries', () => {
    expect(getHotQueries().length).toBe(14);
  });

  it('loads 4 quick entries', () => {
    expect(getQuickEntries().length).toBe(4);
  });

  it('loads 12 suggestions', () => {
    expect(getSuggestions().length).toBe(12);
  });

  it('finds skill by id (晋升底层逻辑)', () => {
    const s = getSkillById('jinsheng-dicing-luoji');
    expect(s).toBeDefined();
    expect(s?.name).toBe('晋升底层逻辑');
    expect(s?.category).toBe('promotion');
  });

  it('finds skill by id (反问框架)', () => {
    const s = getSkillById('reverse-questioning-framework');
    expect(s).toBeDefined();
    expect(s?.name).toBe('反问框架');
    expect(s?.category).toBe('interview');
  });

  it('returns undefined for unknown skill id', () => {
    const s = getSkillById('not-a-real-skill');
    expect(s).toBeUndefined();
  });
});

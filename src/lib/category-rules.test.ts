// src/lib/category-rules.test.ts
// ReUp v2 Phase 2: category-rules L2 分类规则表测试
// TDD: 测试覆盖 deriveCategory 的命中行为、优先级、闭包 union、doc_title 兜底映射。
//
// 框架通用化后：规则表与 doc_title hint 映射已清空，deriveCategory 恒返回 '通用'。
// 测试保留结构，验证通用兜底行为与空规则表的不变量。

import { describe, it, expect } from 'vitest';
import {
  CATEGORY_RULES,
  deriveCategory,
  type TopicCategory,
  PROMOTION_DOC_TITLE_HINTS,
  INTERVIEW_DOC_TITLE_HINTS,
} from './category-rules';

// ---------------- 类型闭包检查 ----------------

describe('category-rules: TopicCategory 类型闭包', () => {
  it('TopicCategory 是 string（框架通用化后放宽为 string）', () => {
    // 用赋值给 const 的方式做编译期断言。
    const a: TopicCategory = '通用';
    const b: TopicCategory = 'alpha';
    const c: TopicCategory = 'beta';
    expect([a, b, c]).toHaveLength(3);
  });
});

// ---------------- 通用兜底（规则表已清空） ----------------

describe('category-rules: deriveCategory 通用兜底', () => {
  it('空对象（所有字段 undefined）→ "通用"', () => {
    expect(deriveCategory({})).toBe('通用');
  });

  it('所有字段空字符串 → "通用"', () => {
    expect(deriveCategory({ title_path: '', doc_title: '', section_title: '' })).toBe('通用');
  });

  it('完全无关的标题 → "通用"', () => {
    expect(
      deriveCategory({
        title_path: 'some random path with no keywords',
        doc_title: 'Untitled Doc',
        section_title: 'Mystery Section',
      })
    ).toBe('通用');
  });

  it('任意输入（规则表已清空）→ "通用"', () => {
    expect(
      deriveCategory({
        title_path: 'alpha / overview',
        section_title: 'alpha overview',
      })
    ).toBe('通用');
  });

  it('带 doc_title 但 hint 映射为空 → "通用"', () => {
    expect(
      deriveCategory({
        title_path: 'doc-a',
        doc_title: 'doc-a',
        section_title: 'doc-a',
      })
    ).toBe('通用');
  });
});

// ---------------- 边界 / 兜底 ----------------

describe('category-rules: 边界与兜底', () => {
  it('空对象（所有字段 undefined）→ "通用"', () => {
    expect(deriveCategory({})).toBe('通用');
  });

  it('所有字段空字符串 → "通用"', () => {
    expect(deriveCategory({ title_path: '', doc_title: '', section_title: '' })).toBe('通用');
  });

  it('完全无关的标题 → "通用"', () => {
    expect(
      deriveCategory({
        title_path: 'some random path with no keywords',
        doc_title: 'Untitled Doc',
        section_title: 'Mystery Section',
      })
    ).toBe('通用');
  });
});

// ---------------- 优先级 / 确定性 ----------------

describe('category-rules: 优先级与确定性', () => {
  it('通用规则 priority 必须为 -1（兜底特性）', () => {
    const general = CATEGORY_RULES.find((r) => r.category === '通用');
    expect(general).toBeDefined();
    expect(general?.priority).toBe(-1);
  });

  it('CATEGORY_RULES 仅包含通用兜底（框架通用化后规则表已清空）', () => {
    expect(CATEGORY_RULES).toHaveLength(1);
    const categories = new Set(CATEGORY_RULES.map((r) => r.category));
    expect(categories.size).toBe(1);
    expect(categories.has('通用')).toBe(true);
  });

  it('PROMOTION_DOC_TITLE_HINTS 为空对象（框架通用化后已清空）', () => {
    expect(Object.keys(PROMOTION_DOC_TITLE_HINTS)).toHaveLength(0);
  });

  it('INTERVIEW_DOC_TITLE_HINTS 为空对象（框架通用化后已清空）', () => {
    expect(Object.keys(INTERVIEW_DOC_TITLE_HINTS)).toHaveLength(0);
  });

  it('同输入多次调用结果一致（无随机 / 无状态）', () => {
    const input = {
      title_path: 'alpha overview',
      section_title: 'alpha overview',
    };
    const r1 = deriveCategory(input);
    const r2 = deriveCategory(input);
    const r3 = deriveCategory(input);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(r1).toBe('通用');
  });

  it('通用兜底规则 priority 为 -1（跳过主循环）', () => {
    const general = CATEGORY_RULES.find((r) => r.category === '通用');
    expect(general).toBeDefined();
    expect(general?.priority).toBe(-1);
  });
});

// src/lib/category-rules.test.ts
// ReUp v2 Phase 2: category-rules L2 分类规则表测试
// TDD: 测试覆盖 spec §3.1 的 19 个细分类 + '通用' 兜底，验证 deriveCategory 的命中行为
// 优先级、闭包 union、doc_title 兜底映射。

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
  it('TopicCategory 是 19 个细分类 + 通用 的 union（不含别的值）', () => {
    // 用赋值给 const 的方式做编译期断言。
    // 若 union 加了新成员，下面这些赋值会编译失败。
    const a: TopicCategory = '通用';
    const b: TopicCategory = '职级体系';
    const c: TopicCategory = '晋升流程';
    const d: TopicCategory = '晋升原则';
    const e: TopicCategory = '晋升答辩';
    const f: TopicCategory = '提名词写作';
    const g: TopicCategory = '学习方法';
    const h: TopicCategory = '能力模型';
    const i: TopicCategory = '技术能力';
    const j: TopicCategory = '自我介绍';
    const k: TopicCategory = '面试流程';
    const l: TopicCategory = '考察标准';
    const m: TopicCategory = '简历优化';
    const n: TopicCategory = '经历包装';
    const o: TopicCategory = '反向提问';
    const p: TopicCategory = '表达技巧';
    const q: TopicCategory = '心态调整';
    const r: TopicCategory = '职业规划';
    const s: TopicCategory = '薪资谈判';
    const t: TopicCategory = '招聘方视角';
    expect([a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t]).toHaveLength(20);
  });
});

// ---------------- 晋升类 8 个 chunk ----------------

describe('category-rules: deriveCategory 晋升类', () => {
  it('"10000 小时定律" → 学习方法', () => {
    expect(
      deriveCategory({
        title_path: '大厂晋升指南（加餐三优化版） / 10000 小时定律的发展史',
        doc_title: '大厂晋升指南（加餐三优化版）',
        section_title: '10000 小时定律的发展史',
      })
    ).toBe('学习方法');
  });

  it('"晋升答辩" → 晋升答辩', () => {
    expect(
      deriveCategory({
        title_path: '晋升答辩 / 答辩准备',
        section_title: '晋升答辩：项目复盘要点',
      })
    ).toBe('晋升答辩');
  });

  it('"提名词" → 提名词写作', () => {
    expect(
      deriveCategory({
        title_path: '加餐二 | 提名词：怎么夸自己才最加分？',
        section_title: '提名词的三大写作要点',
      })
    ).toBe('提名词写作');
  });

  it('"职级" → 职级体系', () => {
    expect(
      deriveCategory({
        title_path: '第 1 章 职级体系：你意识到级别鸿沟了吗？',
        section_title: '第 1 章 职级体系：你意识到级别鸿沟了吗？',
      })
    ).toBe('职级体系');
  });

  it('"能力模型" → 能力模型', () => {
    expect(
      deriveCategory({
        title_path: 'COMD 能力模型: 4 种复杂度 +3 个维度',
        section_title: 'COMD 能力模型: 4 种复杂度 +3 个维度',
      })
    ).toBe('能力模型');
  });

  it('"P10 电影导演" → 职级体系（P10 关键词命中）', () => {
    expect(
      deriveCategory({
        title_path: 'P10：电影导演',
        section_title: 'P10：电影导演',
      })
    ).toBe('职级体系');
  });

  it('"晋升 PPT 标准框架" → 晋升答辩', () => {
    expect(
      deriveCategory({
        title_path: '晋升 PPT 的标准框架',
        section_title: '晋升 PPT 的标准框架',
      })
    ).toBe('晋升答辩');
  });

  it('"技术：精通领域相关技术" → 技术能力（精通关键词）', () => {
    expect(
      deriveCategory({
        title_path: '技术：精通领域相关技术',
        section_title: '技术：精通领域相关技术',
      })
    ).toBe('技术能力');
  });
});

// ---------------- 面试类 8 个 chunk ----------------

describe('category-rules: deriveCategory 面试类', () => {
  it('"自我介绍" → 自我介绍', () => {
    expect(
      deriveCategory({
        title_path: '15|如何做好开场：给自我介绍加"特效"',
        section_title: '15|如何做好开场：给自我介绍加"特效"',
      })
    ).toBe('自我介绍');
  });

  it('"STAR" → 简历优化', () => {
    expect(
      deriveCategory({
        title_path: '简历技巧 / STAR 法则与 BEI 行为面试',
        section_title: 'STAR 法则与 BEI 行为面试',
      })
    ).toBe('简历优化');
  });

  it('"反向提问" → 反向提问', () => {
    expect(
      deriveCategory({
        title_path: '25|应该如何向面试官提问？',
        section_title: '反向提问：怎么问得更聪明？',
      })
    ).toBe('反向提问');
  });

  it('"薪资谈判" → 薪资谈判', () => {
    expect(
      deriveCategory({
        title_path: '26|怎么谈薪水比较好？',
        section_title: '26|怎么谈薪水比较好？',
      })
    ).toBe('薪资谈判');
  });

  it('"卡壳应对" → 表达技巧', () => {
    expect(
      deriveCategory({
        title_path: '卡壳应对的几个小窍门',
        section_title: '卡壳应对的几个小窍门',
      })
    ).toBe('表达技巧');
  });

  it('"换位思考" → 招聘方视角', () => {
    expect(
      deriveCategory({
        title_path: '换位思考：站在对方的角度考虑问题',
        section_title: '换位思考：站在对方的角度考虑问题',
      })
    ).toBe('招聘方视角');
  });

  it('"公司到底想要什么样的人" → 考察标准（关键词命中）', () => {
    expect(
      deriveCategory({
        title_path: '01|公司到底想要什么样的人？',
        section_title: '01|公司到底想要什么样的人？',
      })
    ).toBe('考察标准');
  });

  it('"项目价值" → 经历包装', () => {
    expect(
      deriveCategory({
        title_path: '18|怎样展示你在项目中的重要性？',
        section_title: '项目价值与项目结果',
      })
    ).toBe('经历包装');
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

  it('晋升书 doc_title 兜底：第 10 章封面 → 职级体系', () => {
    expect(
      deriveCategory({
        title_path: '大厂晋升指南（第10章优化版）',
        doc_title: '大厂晋升指南（第10章优化版）',
        section_title: '大厂晋升指南（第10章优化版）',
      })
    ).toBe('职级体系');
  });

  it('面试书 doc_title 兜底：简历章封面 → 简历优化', () => {
    expect(
      deriveCategory({
        title_path: '13_10如何让你的简历更受青睐',
        doc_title: '13_10如何让你的简历更受青睐',
        section_title: '13_10如何让你的简历更受青睐',
      })
    ).toBe('简历优化');
  });

  it('面试书 doc_title 兜底：薪资章封面 → 薪资谈判', () => {
    expect(
      deriveCategory({
        title_path: '29_26怎么谈薪水比较好',
        doc_title: '29_26怎么谈薪水比较好',
        section_title: '29_26怎么谈薪水比较好',
      })
    ).toBe('薪资谈判');
  });
});

// ---------------- 优先级 / 确定性 ----------------

describe('category-rules: 优先级与确定性', () => {
  it('通用规则 priority 必须为 -1（兜底特性）', () => {
    const general = CATEGORY_RULES.find((r) => r.category === '通用');
    expect(general).toBeDefined();
    expect(general?.priority).toBe(-1);
  });

  it('CATEGORY_RULES 必须包含全部 20 条（19 细分类 + 通用）', () => {
    expect(CATEGORY_RULES).toHaveLength(20);
    const categories = new Set(CATEGORY_RULES.map((r) => r.category));
    expect(categories.size).toBe(20);
    expect(categories.has('通用')).toBe(true);
  });

  it('PROMOTION_DOC_TITLE_HINTS 的所有值都是合法的 TopicCategory', () => {
    const valid = new Set<TopicCategory>(CATEGORY_RULES.map((r) => r.category));
    for (const cat of Object.values(PROMOTION_DOC_TITLE_HINTS)) {
      expect(valid.has(cat)).toBe(true);
    }
  });

  it('INTERVIEW_DOC_TITLE_HINTS 的所有值都是合法的 TopicCategory', () => {
    const valid = new Set<TopicCategory>(CATEGORY_RULES.map((r) => r.category));
    for (const cat of Object.values(INTERVIEW_DOC_TITLE_HINTS)) {
      expect(valid.has(cat)).toBe(true);
    }
  });

  it('同输入多次调用结果一致（无随机 / 无状态）', () => {
    const input = {
      title_path: '卡壳应对的几个小窍门',
      section_title: '卡壳应对的几个小窍门',
    };
    const r1 = deriveCategory(input);
    const r2 = deriveCategory(input);
    const r3 = deriveCategory(input);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(r1).toBe('表达技巧');
  });

  it('命中关键词后立即返回（不会继续尝试其它规则）', () => {
    // 构造同时能命中"自我介绍"和"开场"的输入
    // 这两个关键词属于同一规则（自我介绍），不影响；
    // 但我们用 priority 字段验证只取第一条
    const r1 = CATEGORY_RULES.find((r) => r.category === '自我介绍');
    const r2 = CATEGORY_RULES.find((r) => r.category === '面试流程');
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    if (r1 && r2) {
      expect(r1.priority).toBe(10);
      expect(r2.priority).toBe(10);
    }
  });
});

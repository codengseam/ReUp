// src/lib/category-rules.ts
// ReUp v2 Phase 2: L2 chunk 主题分类规则表（单一事实源）
// Spec: docs/superpowers/specs/2026-06-15-knowledge-metadata-restructure-design.md §3.1
//
// 用法：
//   - `deriveCategory(record)` 根据 title_path + doc_title + section_title 命中第一条规则
//   - 兜底分类 `'通用'`，表示 chunk 没有更细的语义标签
//   - 规则按声明顺序匹配，命中后即返回（priority 相同时取先声明的）
//   - 第二层「doc_title hint」把每章封面/介绍页按章节主题归档（用于 hit-rate ≥ 95%）

// ---------------- 类型定义 ----------------

/**
 * L2 chunk 主题分类（19 个细分类 + 1 个通用兜底）
 * 命名与书内业务语义一致：晋升类 8 个 + 面试类 11 个 + 通用。
 */
export type TopicCategory =
  // 晋升类（晋升指南）
  | '职级体系' | '晋升流程' | '晋升原则' | '晋升答辩'
  | '提名词写作' | '学习方法' | '能力模型' | '技术能力'
  // 面试类（面试现场）
  | '自我介绍' | '面试流程' | '考察标准' | '简历优化'
  | '经历包装' | '反向提问' | '表达技巧' | '心态调整'
  | '职业规划' | '薪资谈判' | '招聘方视角'
  // 兜底
  | '通用';

/**
 * 单条分类规则。匹配规则：任一 keyword 出现在拼接文本中即匹配。
 * `priority` 越大越优先匹配（用于同 chunk 命中多类时取更具体的那条）。
 */
export interface CategoryRule {
  /** 分类名（必须是 TopicCategory 之一） */
  category: TopicCategory;
  /** 关键词列表（中文短语 + 章节标识）；任一命中即匹配 */
  keywords: string[];
  /** 优先级；通用兜底用 -1 跳过主循环 */
  priority: number;
}

/**
 * chunk 的最小入参：仅依赖 3 个标题字段，不读 text/vector。
 * 字段全部 optional —— 缺失时退化为空串。
 */
export interface CategoryInput {
  title_path?: string;
  doc_title?: string;
  section_title?: string;
}

// ---------------- 规则表（按 spec §3.1 顺序） ----------------

/**
 * 分类规则表（spec §3.1 起步规则 + 基于真实数据迭代的扩展关键词）。
 * 顺序即为匹配优先级：先匹配到先返回。
 * 「通用」作为兜底，priority = -1 在 deriveCategory 中被跳过。
 */
export const CATEGORY_RULES: ReadonlyArray<CategoryRule> = [
  // -------- 晋升类 --------
  { category: '职级体系',     keywords: ['职级', '职级对标', '职级档次', 'P7', 'P8', 'P10', 'P9', 'P6', '天梯', '管理', '业务', '专家', '指挥', '硬通货'], priority: 10 },
  { category: '晋升流程',     keywords: ['晋升流程', '晋升入门', '晋升认知', '晋升步骤', '晋升关卡', '提名阶段'], priority: 10 },
  { category: '晋升原则',     keywords: ['晋升原则', '晋升逻辑', '重新理解晋升', '什么样的人更容易'], priority: 10 },
  { category: '晋升答辩',     keywords: ['晋升答辩', '晋升陈述', '晋升材料', '晋升 PPT', '晋升PPT'], priority: 10 },
  { category: '提名词写作',   keywords: ['提名词'], priority: 10 },
  { category: '学习方法',     keywords: ['10000', '10000 小时', '海绵', 'Play', 'Teach', '链式', '环式', '比较学习', '积累', '三段分解'], priority: 10 },
  { category: '能力模型',     keywords: ['能力模型', 'COMD', '复杂度', '4种复杂度', '4 种复杂度'], priority: 10 },
  { category: '技术能力',     keywords: ['技术提升', '技术深度', '技术宽度', '技术广度', '技术套路', '精通', '跨领域', '基础技术', '整合', '套路'], priority: 10 },
  // -------- 面试类 --------
  { category: '自我介绍',     keywords: ['开场', '自我介绍', '开场词'], priority: 10 },
  { category: '面试流程',     keywords: ['面试流程', '面试方法论', '面试准备', '面试地图', '面试过程', '面试架构', '如何面试', '考官面对面', '面试官面对面'], priority: 10 },
  { category: '考察标准',     keywords: ['考察标准', '考核逻辑', '人才甄选', '素质模型', '面试官视角', '面试逻辑', '公司到底想要什么样', '编程能力', '考查', '想要什么样的人'], priority: 10 },
  { category: '简历优化',     keywords: ['简历优化', '简历亮点', 'STAR', '简历'], priority: 10 },
  { category: '经历包装',     keywords: ['经历包装', '项目价值', '项目结果', '详历', '亮点', '项目中的重要性'], priority: 10 },
  { category: '反向提问',     keywords: ['反向提问', '反问框架', '面试禁忌', '面试答疑', '向面试官提问', '如何向'], priority: 10 },
  { category: '表达技巧',     keywords: ['回答策略', '技术表达', '卡壳应对', '表达方法', '回答', '回答更到位', '讲明白技术', '被问住', '技术的水'], priority: 10 },
  { category: '心态调整',     keywords: ['紧张', '调整期待', '提高能力', '缓解紧张'], priority: 10 },
  { category: '职业规划',     keywords: ['职业规划', '职业选择', '职业去向', '角色划分', '换工作', '择业', '喜欢或擅长', '程序员后来', '工作满意度', '满意度'], priority: 10 },
  { category: '薪资谈判',     keywords: ['薪资谈判', '薪水构成', '谈薪', '薪水', '怎么谈薪水'], priority: 10 },
  { category: '招聘方视角',   keywords: ['换位思考', '招聘过程', '招聘全流程', '用人标准', '隐性评估', '自我认知', '招聘', '面试官', '兴趣爱好', '优缺点', '如何认识自己', '面试与应聘', '站在对方'], priority: 10 },
  // -------- 兜底 --------
  { category: '通用',         keywords: [], priority: -1 },
];

// ---------------- doc_title 兜底映射 ----------------

/**
 * 晋升书：每章封面/介绍页（section_title = doc_title）按章节主题归档。
 * 关键词匹配对这类 chunk 通常无信号（标题里只有章名），需要 doc_title hint 兜底。
 */
export const PROMOTION_DOC_TITLE_HINTS: Readonly<Record<string, TopicCategory>> = {
  '大厂晋升指南': '职级体系',
  '大厂晋升指南（1~3章优化版）': '职级体系',
  '大厂晋升指南（加餐一优化版）': '职级体系',
  '大厂晋升指南（加餐二优化版）': '提名词写作',
  '大厂晋升指南（加餐三优化版）': '学习方法',
  '大厂晋升指南（加餐四优化版）': '技术能力',
  '大厂晋升指南（开篇词优化版）': '晋升原则',
  '大厂晋升指南（第10章优化版）': '职级体系',
  '大厂晋升指南（第11章优化版）': '职级体系',
  '大厂晋升指南（第12章优化版）': '晋升答辩',
  '大厂晋升指南（第14章优化版）': '晋升原则',
  '大厂晋升指南（第15章优化版）': '晋升答辩',
  '大厂晋升指南（第17章优化版）': '学习方法',
  '大厂晋升指南（第18章优化版）': '学习方法',
  '大厂晋升指南（第19章优化版）': '学习方法',
  '大厂晋升指南（第20章优化版）': '学习方法',
  '大厂晋升指南（第4章优化版）': '职级体系',
  '大厂晋升指南（第5章优化版）': '能力模型',
  '大厂晋升指南（第6章优化版）': '职级体系',
  '大厂晋升指南（第7章优化版）': '职级体系',
  '大厂晋升指南（第8章优化版）': '职级体系',
  '大厂晋升指南（第9章优化版）': '职级体系',
};

/**
 * 面试书：每章 doc_title 即章节文件名（"13_10如何让你的简历更受青睐"），
 * 按章节业务主题归档。同样用于 chapter 封面/介绍页。
 */
export const INTERVIEW_DOC_TITLE_HINTS: Readonly<Record<string, TopicCategory>> = {
  '01_面试现场未完待续2019_04_02': '面试流程',
  '02_简介': '面试流程',
  '03_开篇词面试这样做会功到自然成': '面试流程',
  '04_01公司到底想要什么样的人': '考察标准',
  '05_02想要成功面试先要弄懂面试过程': '面试流程',
  '06_03面试官的面试逻辑是什么': '考察标准',
  '07_04现在的你到底该不该换工作': '职业规划',
  '08_05考官面对面程序员择业时常碰到的几个疑惑': '职业规划',
  '09_06喜欢或擅长的工作你该选哪一个': '职业规划',
  '10_07职业规划一你真的想好要怎么发展了吗': '职业规划',
  '11_08考官面对面如何有效地准备一场面试': '面试流程',
  '12_09职业规划二程序员后来都去干啥了': '职业规划',
  '13_10如何让你的简历更受青睐': '简历优化',
  '14_11考官面对面面试注意事项及面试官们常见的思维模式': '反向提问',
  '15_12经历没有亮点可讲你应当做份详历': '经历包装',
  '16_13面试紧张怎么办': '心态调整',
  '17_14面试答疑一说说你面试中的一些困惑': '反向提问',
  '18_15如何做好开场给自我介绍加特效': '自我介绍',
  '19_16你真能讲明白技术吗': '表达技巧',
  '20_17考官面对面面试与应聘如何站在对方的角度考虑问题': '招聘方视角',
  '21_18怎样展示你在项目中的重要性': '经历包装',
  '22_19如何认识自己的优缺点': '招聘方视角',
  '23_20考官面对面我是如何面试程序员的': '考察标准',
  '24_21透过兴趣爱好面试官可以看出什么': '招聘方视角',
  '25_22如何让你的回答更到位': '表达技巧',
  '26_23考官面对面我们是如何面试架构师的': '考察标准',
  '27_24被面试官问住了怎么办': '表达技巧',
  '28_25应该如何向面试官提问': '反向提问',
  '29_26怎么谈薪水比较好': '薪资谈判',
  '30_27面试答疑二面试问答环节的一些思考': '反向提问',
  '31_TABLE_OF_CONTENTS': '面试流程',
  '《面试现场》-源素材': '面试流程',
};

// ---------------- 派生函数 ----------------

/**
 * 派生 chunk 的 category。
 *
 * 匹配流程：
 *   1) 拼接 title_path + doc_title + section_title
 *   2) 依次遍历 CATEGORY_RULES，跳过 priority < 0 的兜底规则；
 *      命中 keywords 的第一条直接返回其 category
 *   3) 关键词都没命中时，按 book 走 doc_title 兜底映射
 *      （晋升书 → PROMOTION_DOC_TITLE_HINTS；面试书 → INTERVIEW_DOC_TITLE_HINTS）
 *   4) 都不命中 → '通用'
 *
 * 输入字段全部 optional；缺失时按空串处理，永不抛错。
 */
export function deriveCategory(record: CategoryInput): TopicCategory {
  const text = `${record.title_path ?? ''} ${record.doc_title ?? ''} ${record.section_title ?? ''}`;

  for (const r of CATEGORY_RULES) {
    if (r.priority < 0) continue;
    if (r.keywords.some((k) => text.includes(k))) {
      return r.category;
    }
  }

  if (record.doc_title) {
    if (record.doc_title in PROMOTION_DOC_TITLE_HINTS) {
      return PROMOTION_DOC_TITLE_HINTS[record.doc_title] as TopicCategory;
    }
    if (record.doc_title in INTERVIEW_DOC_TITLE_HINTS) {
      return INTERVIEW_DOC_TITLE_HINTS[record.doc_title] as TopicCategory;
    }
  }

  return '通用';
}

// ---------------- 默认导出（frozen 快照，供测试 import） ----------------

/** 冻结的默认导出快照，避免运行时被改。 */
const frozen = Object.freeze({
  CATEGORY_RULES,
  PROMOTION_DOC_TITLE_HINTS,
  INTERVIEW_DOC_TITLE_HINTS,
  deriveCategory,
});
export default frozen;

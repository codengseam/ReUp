#!/usr/bin/env node
/**
 * scripts/backfill-metadata.mjs
 * ReUp v2 Phase 2: data/skill-vectors.json 元数据回填
 * Spec: docs/superpowers/specs/2026-06-15-knowledge-metadata-restructure-design.md §3.2
 *
 * 行为：
 *   - 读 data/skill-vectors.json（process.cwd()）
 *   - 对每条 record 解析 metadata（字符串或对象），调 deriveCategory / deriveTopic
 *   - 写回 metadata：新增 category + topic 字段（不破坏其它字段）
 *   - 校验：非 通用 占比 ≥ 95%，否则 exit 1
 *   - 幂等：可重复运行；即使 metadata 已有 category / topic 也重算并覆盖
 *   - --dry-run：只打印统计，不写文件
 *
 * 注意：规则表与 src/lib/category-rules.ts 保持一一对应（手动镜像）。
 *       这是 spec 允许的一次性脚本实现，不通过 TS import 跨工具链。
 *
 * 库式导入：
 *   - 通过 named export 暴露 deriveCategory / deriveTopic / backfill 等
 *     供 scripts/backfill-metadata.test.mjs 做单元 / 集成测试。
 *   - CLI 入口（main）仅在作为主模块运行时执行。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------- 参数解析 ----------------

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const DATA_PATH = resolve(process.cwd(), 'data/skill-vectors.json');

// ---------------- 分类规则（与 category-rules.ts 同步） ----------------

const CATEGORY_RULES = [
  // 晋升类
  { category: '职级体系',     keywords: ['职级', '职级对标', '职级档次', 'P7', 'P8', 'P10', 'P9', 'P6', '天梯', '管理', '业务', '专家', '指挥', '硬通货'], priority: 10 },
  { category: '晋升流程',     keywords: ['晋升流程', '晋升入门', '晋升认知', '晋升步骤', '晋升关卡', '提名阶段'], priority: 10 },
  { category: '晋升原则',     keywords: ['晋升原则', '晋升逻辑', '重新理解晋升', '什么样的人更容易'], priority: 10 },
  { category: '晋升答辩',     keywords: ['晋升答辩', '晋升陈述', '晋升材料', '晋升 PPT', '晋升PPT'], priority: 10 },
  { category: '提名词写作',   keywords: ['提名词'], priority: 10 },
  { category: '学习方法',     keywords: ['10000', '10000 小时', '海绵', 'Play', 'Teach', '链式', '环式', '比较学习', '积累', '三段分解'], priority: 10 },
  { category: '能力模型',     keywords: ['能力模型', 'COMD', '复杂度', '4种复杂度', '4 种复杂度'], priority: 10 },
  { category: '技术能力',     keywords: ['技术提升', '技术深度', '技术宽度', '技术广度', '技术套路', '精通', '跨领域', '基础技术', '整合', '套路'], priority: 10 },
  // 面试类
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
  { category: '通用',         keywords: [], priority: -1 },
];

const PROMOTION_DOC_TITLE_HINTS = {
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

const INTERVIEW_DOC_TITLE_HINTS = {
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

function deriveCategory(record) {
  const text = `${record.title_path ?? ''} ${record.doc_title ?? ''} ${record.section_title ?? ''}`;
  for (const r of CATEGORY_RULES) {
    if (r.priority < 0) continue;
    if (r.keywords.some((k) => text.includes(k))) {
      return r.category;
    }
  }
  if (record.doc_title) {
    if (Object.prototype.hasOwnProperty.call(PROMOTION_DOC_TITLE_HINTS, record.doc_title)) {
      return PROMOTION_DOC_TITLE_HINTS[record.doc_title];
    }
    if (Object.prototype.hasOwnProperty.call(INTERVIEW_DOC_TITLE_HINTS, record.doc_title)) {
      return INTERVIEW_DOC_TITLE_HINTS[record.doc_title];
    }
  }
  return '通用';
}

/**
 * 派生 chunk 的 topic：取 section_title，去掉重复的 book / doc_title 前缀；
 * 清洗「N|」「加餐N|」之类的章节前缀；若空则用 doc_title。
 */
function deriveTopic(record) {
  let s = String(record.section_title ?? '').trim();
  const d = String(record.doc_title ?? '').trim();
  const b = String(record.book ?? '').trim();

  if (b && s === b) s = '';
  // 去掉「大厂晋升指南（XX优化版）」/「面试现场」包装
  s = s.replace(/^大厂晋升指南（[^）]*优化版）\s*/, '');
  s = s.replace(/^面试现场\s*/, '');
  // 去掉章节号前缀（"01|" / "加餐一 |" / "第 2 章" / "技巧 1："）
  s = s.replace(/^(加餐\s*[一二三四五六七八九十0-9]+|第\s*[0-9]+\s*章|技巧\s*[0-9]+|[0-9]+|附\s*录)\s*[|｜：:]\s*/, '');
  // 再次兜底：去掉书名 / doc_title 前缀
  if (b && s.startsWith(b)) s = s.slice(b.length).trim();
  if (d && s.startsWith(d)) s = s.slice(d.length).trim();

  s = s.trim();
  if (!s) return d || b || '';
  return s;
}

// ---------------- 元数据读写 ----------------

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  if (typeof raw === 'string') {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') return { ...obj };
    } catch {
      // 解析失败时当作空对象（保持向后兼容）
    }
  }
  return {};
}

function serializeMetadata(obj) {
  // 与现有文件格式保持一致：metadata 字段是 JSON 字符串
  return JSON.stringify(obj);
}

function backfill(records) {
  return records.map((rec) => {
    const meta = parseMetadata(rec.metadata);
    const category = deriveCategory(rec);
    const topic = deriveTopic(rec);
    const newMeta = { ...meta, category, topic };
    return { ...rec, metadata: serializeMetadata(newMeta) };
  });
}

function countByCategory(records) {
  const out = {};
  for (const rec of records) {
    const meta = parseMetadata(rec.metadata);
    const cat = typeof meta.category === 'string' ? meta.category : '通用';
    out[cat] = (out[cat] || 0) + 1;
  }
  return out;
}

// ---------------- Main ----------------

function main() {
  console.log(`[backfill] 读取 ${DATA_PATH}${DRY_RUN ? ' (--dry-run)' : ''}`);
  let raw;
  try {
    raw = readFileSync(DATA_PATH, 'utf8');
  } catch (err) {
    console.error(`[backfill] 读取失败: ${err.message}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[backfill] JSON 解析失败: ${err.message}`);
    process.exit(1);
  }

  if (!parsed || !Array.isArray(parsed.vectors)) {
    console.error('[backfill] 找不到 vectors 数组');
    process.exit(1);
  }

  const original = parsed.vectors;
  const updated = backfill(original);
  const counts = countByCategory(updated);
  const total = updated.length;
  const general = counts['通用'] || 0;
  const hit = total - general;
  const hitRate = total > 0 ? (hit / total) * 100 : 0;

  console.log(`[backfill] 共 ${total} 条 record`);
  console.log(`[backfill] 命中非 通用: ${hit} / ${total} = ${hitRate.toFixed(2)}%`);
  console.log(`[backfill] 通用: ${general} (${total > 0 ? ((general / total) * 100).toFixed(2) : '0.00'}%)`);
  console.log('[backfill] 分类分布:');
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) {
    const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)}  (${pct}%)`);
  }

  if (hitRate < 95) {
    console.error(`[backfill] 命中率 ${hitRate.toFixed(2)}% 低于 95% 阈值，校验失败`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('[backfill] --dry-run 模式：未写文件');
    return;
  }

  // 不破坏 dimension / count / version 等顶层字段
  const newData = { ...parsed, vectors: updated };
  try {
    writeFileSync(DATA_PATH, JSON.stringify(newData, null, 2) + '\n', 'utf8');
    console.log(`[backfill] 写回 ${DATA_PATH}`);
  } catch (err) {
    console.error(`[backfill] 写回失败: ${err.message}`);
    process.exit(1);
  }

  console.log('[backfill] 完成');
}

// ---------------- 模块入口守卫 ----------------

/**
 * 仅当本文件作为主模块被 `node` 运行时才执行 main()。
 * 被 import 时只暴露命名导出，副作用为零（方便 vitest 单测）。
 */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}

// ---------------- 命名导出（供 vitest 单测） ----------------

export {
  CATEGORY_RULES,
  PROMOTION_DOC_TITLE_HINTS,
  INTERVIEW_DOC_TITLE_HINTS,
  deriveCategory,
  deriveTopic,
  parseMetadata,
  serializeMetadata,
  backfill,
  countByCategory,
};

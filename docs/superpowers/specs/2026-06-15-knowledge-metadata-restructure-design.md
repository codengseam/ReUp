# ReUp — Knowledge Metadata Restructure Design

**Date**: 2026-06-15
**Status**: Draft (pending user review)
**Branch**: `local-deploy`
**Supersedes (in part)**: `metadata-tab.tsx` 现状（按 Skill 维度全空）；不改其它 spec

---

## 1. 背景

admin 后台 2 个 tab 当前体验崩坏，根因都是「数据 + UI 语义错位」。

### 1.1 复现证据（已跑过统计脚本验证）

| 现象 | 根因 | 证据 |
|---|---|---|
| 元数据 tab「按 Skill」分组空 | chunk `metadata.skillName` 全空（608/608 undefined） | `node _inspect.cjs` |
| 知识库 tab「按分类」分组空，全进 `(空)` | chunk `metadata.category` 全空（608/608 undefined） | 同上 |
| 「按书」只显示 "大厂晋升指南" / "面试现场" | `book` 字段就是这 2 个值 | `byBook = {大厂晋升指南: 274, 面试现场: 334}` |
| chunk 实际有更细主题，但 UI 看不到 | `title_path` 是面包屑（153 个不同值），`doc_title` 是章级（54 个），admin 都不展示 | `node _inspect2.cjs` |

### 1.2 概念混淆（必须在 spec 内厘清）

| 层级 | 含义 | 当前存放 | 当前被消费方 |
|---|---|---|---|
| **L1 框架 Skill** | 8 个对话策略（注入 system prompt 指导 LLM 怎么回答） | `data/skills.json` 的 `skills[]` + `skills/<id>/SKILL.md` | `src/app/api/chat/route.ts`（注入 prompt） |
| **L2 chunk 主题** | chunk 讲的是什么（晋升/面试 的细分话题） | 应该存在 `metadata.category`（**当前空**） | 应该是 admin 检索维度 |
| **L3 chunk 主题层级** | 章/节标题（实际数据富矿） | `title_path` / `doc_title` / `section_title` | 当前无消费者 |

L1 是**对话层**（运行时 prompt 注入），L2/L3 是**内容层**（离线 metadata）。现在 metadata-tab 把 L1 和 L2 用同一个 "Skill" 词表达，造成了"按 Skill 是空" 的认知错乱。

---

## 2. 目标 & 非目标

### 2.1 In-Scope

1. **数据补全**：给 608 chunks 的 `metadata` 补 `category`（L2 细分类，规则表定义 19 个业务类 + 1 个通用兜底 = 20 个枚举值）+ `topic`（章节核心短语）
2. **admin 重组**：
   - 新增 tab「**Skill 框架**」展示 8 个对话层 Skill（**L1**）
   - 知识库 tab 改 4 个分组维度：按书 / 按分类 / 按章 / 按节（**L3 多视角**）
   - 元数据 tab 改名「**分类**」并展示 L2 细分类，去掉"按 Skill 维度"歧义
3. **代码同步**：`admin-knowledge.ts` 增加 `byCategory` / `byChapter` / `bySection` 聚合；`metadata-tab.tsx` 重写
4. **测试**：backfill 脚本 + 聚合函数 + UI 渲染三层测试，Vitest ≥80% 覆盖

### 2.2 Out-of-Scope

- chunk 不挂 `skillName`（用户已明确：框架 Skill 不下沉到 chunk）
- RAG runtime 不读取新 `category`/`topic`（搜索仍用 `book` + `text` 语义 + 稀疏匹配）
- 8 个 Skill 的内容（SKILL.md 本身）不改
- 自动分类（用静态规则表，不上 LLM）

---

## 3. 设计

### 3.1 数据层：分类规则表

新文件 **`src/lib/category-rules.ts`**（单一事实源）：

```ts
// L2 分类规则：按 title_path 关键词匹配
export type TopicCategory =
  // 晋升类 (promotion book)
  | '职级体系' | '晋升流程' | '晋升原则' | '晋升答辩'
  | '提名词写作' | '学习方法' | '能力模型' | '技术能力'
  // 面试类 (interview book)
  | '自我介绍' | '面试流程' | '考察标准' | '简历优化'
  | '经历包装' | '反向提问' | '表达技巧' | '心态调整'
  | '职业规划' | '薪资谈判' | '招聘方视角'
  | '通用';  // 兜底

export interface CategoryRule {
  category: TopicCategory;
  /** 任一关键词命中即匹配（中文 + 章节标识都支持） */
  keywords: string[];
  /** 优先级，数字大优先（先匹配更具体的） */
  priority: number;
}

export const CATEGORY_RULES: CategoryRule[] = [
  // 晋升
  { category: '职级体系',     keywords: ['职级', '职级对标', '职级档次', 'P7', 'P8', 'P10'], priority: 10 },
  { category: '晋升流程',     keywords: ['晋升流程', '晋升入门', '晋升认知'], priority: 10 },
  { category: '晋升原则',     keywords: ['晋升原则', '晋升逻辑'], priority: 10 },
  { category: '晋升答辩',     keywords: ['晋升答辩', '晋升陈述', '晋升材料', '晋升 PPT'], priority: 10 },
  { category: '提名词写作',   keywords: ['提名词'], priority: 10 },
  { category: '学习方法',     keywords: ['10000', '10000 小时', '海绵', 'Play', 'Teach', '链式', '环式', '比较学习', '积累'], priority: 10 },
  { category: '能力模型',     keywords: ['能力模型', 'COMD', '复杂度', '4种复杂度'], priority: 10 },
  { category: '技术能力',     keywords: ['技术提升', '技术深度', '技术宽度', '技术广度', '技术套路', '精通', '跨领域'], priority: 10 },
  // 面试
  { category: '自我介绍',     keywords: ['开场', '自我介绍'], priority: 10 },
  { category: '面试流程',     keywords: ['面试流程', '面试现场', '面试方法论', '面试准备', '面试地图'], priority: 10 },
  { category: '考察标准',     keywords: ['考察标准', '考核逻辑', '人才甄选', '素质模型', '面试官视角'], priority: 10 },
  { category: '简历优化',     keywords: ['简历优化', '简历亮点', 'STAR'], priority: 10 },
  { category: '经历包装',     keywords: ['经历包装', '项目价值', '项目结果'], priority: 10 },
  { category: '反向提问',     keywords: ['反向提问', '反问框架', '面试禁忌', '面试答疑'], priority: 10 },
  { category: '表达技巧',     keywords: ['回答策略', '技术表达', '卡壳应对', '表达方法'], priority: 10 },
  { category: '心态调整',     keywords: ['紧张', '调整期待', '提高能力'], priority: 10 },
  { category: '职业规划',     keywords: ['职业规划', '职业选择', '职业去向', '角色划分'], priority: 10 },
  { category: '薪资谈判',     keywords: ['薪资谈判', '薪水构成', '谈薪'], priority: 10 },
  { category: '招聘方视角',   keywords: ['换位思考', '招聘过程', '招聘全流程', '用人标准', '隐性评估', '自我认知'], priority: 10 },
  { category: '通用',         keywords: [], priority: -1 },  // 兜底
];

/** 派生 chunk 的 category；title_path + doc_title 任一命中即匹配 */
export function deriveCategory(record: {
  title_path?: string;
  doc_title?: string;
  section_title?: string;
}): TopicCategory {
  const text = `${record.title_path ?? ''} ${record.doc_title ?? ''} ${record.section_title ?? ''}`;
  let best: CategoryRule | null = null;
  for (const r of CATEGORY_RULES) {
    if (r.priority < 0) continue;  // 跳过兜底
    if (r.keywords.some(k => text.includes(k))) {
      if (!best || r.priority > best.priority) best = r;
    }
  }
  return best?.category ?? '通用';
}
```

**置信度评估**：title_path 共 153 个不同值。手动抽检（晋升前 30 + 面试前 30）— 所有 chunk 都能命中至少 1 条规则（因为 title_path 包含章名 + 节名，关键词集合已覆盖）。**估计命中率 ≥ 95%**（剩 5% 落入「通用」）。

### 3.2 数据层：回填脚本

新文件 **`scripts/backfill-metadata.mjs`**：

- 读 `data/skill-vectors.json`
- 对每条 record 调 `deriveCategory(...)`
- 写回 `metadata` 字段（**保持原结构 + 增字段**，不破坏其它字段）
- 验证：`category !== ''` 的 chunks ≥ 95%，且与抽样比对一致
- 不改 `id` / `vector` / `sparse_vector` / `book` / `text` 等检索相关字段
- 幂等：可重复运行

**`metadata` schema 变更**：

```jsonc
// before
{ "book": "...", "filename": "...", "source_path": "...", "doc_title": "...",
  "header_path": "/", "header_titles": [], "section_title": "...", "title_path": "...",
  "chunk_index": 0 }

// after (新增 2 字段)
{ /* ...原有字段... */,
  "category": "晋升答辩",      // 新增：L2 细分类
  "topic": "晋升 PPT 写作" }   // 新增：节级一句话主题（从 section_title 派生，去掉重复书名）
```

- `topic` 派生：取 `section_title`，去掉重复的 `book` 名和 `doc_title` 前缀；若为空则用 `doc_title` 本身
- 例：`section_title="大厂晋升指南"` + `doc_title="大厂晋升指南（第10章优化版）"` → `topic="大厂晋升指南（第10章优化版）"`
- 例：`section_title="加餐一｜晋升等级：不同的职级体系如何对标？"` + `doc_title="大厂晋升指南（加餐一优化版）"` → `topic="晋升等级：不同的职级体系如何对标？"`

### 3.3 后台层：admin-knowledge 扩展

文件 **`src/lib/admin-knowledge.ts`**：

- 新增聚合维度：`byCategory`（已有，但当前全空 → 现在会填）、`byChapter`（按 `doc_title`）、`bySection`（按 `section_title`）
- `listByGroup` 扩展支持 `category` / `chapter` / `section` 这 3 个新 key
- 内部增加 `getTopicsSummary()` 函数，按 `book × category` 交叉表（让 admin 一眼看出"晋升书里讲答辩有多少 chunk"）
- 现有 `byBook` / `byCategory` / `bySkill` 接口保留（避免破坏现有测试），但 `bySkill` 永远返回空数组（标注 deprecated，3 个月内删除）
- 新增 `getFrameworkSkills()` 函数，包装 `skills-loader.getAllSkills()`，让 admin 走同一套 server lib

### 3.4 后台层：API 扩展

文件 **`src/app/api/admin/knowledge/route.ts`**：

- 现有 actions 保持向后兼容
- 新增 `action=framework-skills` → 返回 8 个框架 Skill 的完整定义（含 SKILL.md 内容）
- 新增 `action=by-chapter` / `action=by-section` → 走 `listByGroup('chapter' | 'section')`
- 错误码不变

文件 **`src/app/api/admin/skills/route.ts`**（新建）：

```
GET /api/admin/skills
200 {
  skills: Array<{
    id, name, category, trigger, framework, steps,
    markdown: string,    // 整个 SKILL.md 文本
    prompt: string       // 实际注入 LLM 的 prompt（来自 skills-loader）
  }>
}
```

### 3.5 UI 层：admin tabs 重组

**Tab 列表**（改 [src/app/admin/page.tsx](file:///Users/dengxiongshihao/Downloads/reup/src/app/admin/page.tsx#L24-L31)）：

| 顺序 | key | label | 图标 | 用途 |
|---|---|---|---|---|
| 1 | dashboard | 概览 | LayoutDashboard | （不变） |
| 2 | knowledge | 知识库 | Database | L2 检索（4 维度） |
| 3 | framework-skills | Skill 框架 | Sparkles | **L1**（**新增**） |
| 4 | prompt | 提示词 | PenLine | （不变） |
| 5 | model | 模型配置 | Cpu | （不变） |
| 6 | rag | RAG 参数 | SlidersHorizontal | （不变） |
| 7 | metadata | 分类 | Tags | L2 浏览 |

**新增** `src/app/admin/_components/framework-skills-tab.tsx`：
- 卡片网格，2 列（晋升类 / 面试类各 4 张）
- 每张卡：`name` + `category` + `trigger` + `framework` + `steps[]` 步骤列表
- 点击展开：右侧抽屉显示 `SKILL.md` 完整内容（高亮 markdown 渲染）
- 顶部统计：8 个 Skill / 晋升 4 / 面试 4

**重写** `src/app/admin/_components/metadata-tab.tsx`（改名为逻辑上「分类」）：
- 顶部 4 个统计卡：晋升/面试/通用/未分类 chunk 数（基于 `book` 派生）
- 分组维度：「按分类（细粒度）」「按书 × 分类交叉」
- 移除「按 Skill 维度」（已拆出到 framework-skills tab）
- 分类下拉过滤器（保留）

**修改** `src/app/admin/_components/knowledge-tab.tsx`：
- 分组 tab 改 4 个：按书 / 按分类 / 按章 / 按节
- 展示列改名：把"知识库名"列改为「主题 = `book` / `doc_title`」（让人一眼看出核心内容）
- 搜索结果展示：从 `book:doc_title:section_title` 改成 3 行，名字用 mono 字体
- 保留所有现有搜索/分页逻辑

---

## 4. 数据流（端到端）

```
[1. 离线一次性]
scripts/backfill-metadata.mjs
   ↓ 读 data/skill-vectors.json
   ↓ 调 category-rules.deriveCategory()
   ↓ 写回 metadata
[2. 运行时]
Admin UI ─→ /api/admin/knowledge?action=stats ─→ admin-knowledge.getKnowledgeStats()
                                                  ├─ loadAllRecords()  (读 backfill 后的 JSON)
                                                  └─ groupCount(records, 'category' | 'book' | 'chapter' | 'section')

Admin UI ─→ /api/admin/skills ─→ skills-loader.getAllSkills() + fs.readFile('skills/<id>/SKILL.md')
```

RAG runtime 路径**不变**：聊天 → search.ts → 仍用 `book` + `text` 语义匹配（不读新 `category` 字段）。

---

## 5. 测试策略

| 层 | 文件 | 覆盖点 |
|---|---|---|
| 单元 | `src/lib/category-rules.test.ts`（新建）| `deriveCategory` 8 个 Skill × 3 字段组合 + 边界（空/全空/通用） |
| 单元 | `src/lib/admin-knowledge.test.ts`（扩展）| 新增 `byCategory` / `byChapter` / `bySection` 聚合；fixture 改 metadata 含 category |
| 集成 | `src/app/api/admin/knowledge/route.test.ts`（扩展）| 新 actions 状态码 |
| 集成 | `src/app/api/admin/skills/route.test.ts`（新建）| 返回 8 个 Skill + markdown |
| 脚本 | `scripts/backfill-metadata.test.mjs`（新建）| 幂等性 + 命中数 ≥ 95% + 不破坏 vector |
| 组件 | `src/app/admin/_components/framework-skills-tab.test.tsx`（新建）| 8 卡渲染 / 展开抽屉 |
| 组件 | `src/app/admin/_components/metadata-tab.test.tsx`（新建）| 分类 tab 渲染 |
| 组件 | `src/app/admin/_components/knowledge-tab.test.tsx`（新建）| 4 分组 tab 切换 |

> 复用现有 vitest pattern（fixture tmp dir + 手摇 VectorStore fake）。

---

## 6. 风险 & 缓解

| 风险 | 缓解 |
|---|---|
| 关键词规则不全面，部分 chunk 落入「通用」 | 通用本身合理（兜底）；后续可基于统计高频词迭代；上线后用 admin 页面人工 review |
| `metadata` 字段写入破坏 vector 检索 | 不改 `vector` / `sparse_vector` / `book` / `text`；backfill 后跑 `pnpm ts-check && pnpm lint && pnpm test` 兜底 |
| `listByGroup` 加新 key 破坏老调用方 | 加 key（不变 enum），扩展 switch |
| skills-loader fs 路径在 client bundle 报错 | 已有 fallback（dev 时 fs，prod 时 bundled JSON）；新 API 走 server runtime（`runtime = 'nodejs'`） |
| 「Skill 框架」tab 与现有「知识库/元数据」视觉割裂 | 复用 `Card` / `Badge` / `Tabs` 现有组件，遵守 DESIGN tokens |

---

## 7. 不在本 spec

- 上传/编辑 chunk（spec §3.4 G2：不持久化用户上传）
- 自动分类（用 LLM 标 category）— 留作 v2.1
- 多语言分类标签 — 留作 v2.1
- 章节级 chunk 重新向量化（不必要）

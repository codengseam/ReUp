# Phase 3 Spec: 导出增强 + 版本管理

**日期**: 2026-06-15  
**目标**: 完善简历输出能力（PDF/Word 导出），支持多版本管理和改写历史对比。  
**依赖**: Phase 1-2 全部完成。

---

## 1. 需求背景

### 1.1 导出现状

当前仅支持 Markdown 导出，用户需要手动转换为 PDF/Word 才能投递。这增加了使用门槛。

### 1.2 版本管理缺失

当前 `storage.ts` 仅支持保存/加载单个简历，无法：
- 保存多个简历版本（不同岗位定制版）
- 对比改写前后的差异
- 回退到历史版本

### 1.3 用户场景

- **场景 A**：用户针对岗位 A 优化简历后，想再针对岗位 B 优化，需要保留两个版本
- **场景 B**：用户想看看 STAR 改写前后的具体差异
- **场景 C**：用户优化后不满意，想回退到原始版本

---

## 2. 功能需求

### 2.1 PDF 导出

#### 输入
- `ResumeDocument` + 可选的 STAR 改写结果
- 模板选择（默认 / 简洁 / 技术）

#### 输出
- PDF 文件（Blob / Buffer）

#### 实现方案
- 使用 `puppeteer` 或 `playwright` 将 HTML 渲染为 PDF
- 或使用 `react-pdf` 生成 PDF
- 或使用 `markdown-pdf` 将 Markdown 转为 PDF

**推荐**: `react-pdf`（纯前端，无 headless browser 依赖）

#### 模板设计

**默认模板**：
- 两栏布局：左侧个人信息 + 技能，右侧经历 + 项目
- 字体：中文使用思源黑体，英文使用 Inter
- 颜色：主色 `#2563eb`，辅色 `#64748b`

**简洁模板**：
- 单栏布局，极简风格
- 无颜色，纯黑白

**技术模板**：
- 突出技能标签
- 项目经历使用卡片式布局

### 2.2 Word 导出

#### 输入
同 PDF 导出。

#### 输出
- DOCX 文件（Blob / Buffer）

#### 实现方案
- 使用 `docx` 库生成 DOCX
- 基于 `export-md.ts` 的输出结构生成

### 2.3 改写历史对比（Diff）

#### 输入
- 原始简历 `ResumeDocument`
- 改写后简历 `ResumeDocument`

#### 输出
- Diff 视图：增删改高亮

#### 对比维度

| 维度 | 对比方式 |
|------|----------|
| 基本信息 | 字段级对比 |
| 工作经历 | 条目级对比（公司/职位/时间段）+ bullet 级对比 |
| 项目经历 | 同上 |
| 技能 | 集合差集对比 |
| 教育经历 | 条目级对比 |

#### Diff 数据结构

```typescript
interface ResumeDiff {
  basic: {
    added: Record<string, string>;
    removed: Record<string, string>;
    changed: Record<string, { old: string; new: string }>;
  };
  experience: Array<{
    type: 'added' | 'removed' | 'changed';
    old?: ResumeExperience;
    new?: ResumeExperience;
    bulletDiff?: Array<{ type: 'added' | 'removed'; text: string }>;
  }>;
  skills: {
    added: string[];
    removed: string[];
  };
  // ... similar for projects, education
}
```

### 2.4 多简历版本管理

#### 数据结构

```typescript
interface ResumeVersion {
  id: string;              // UUID
  name: string;            // 用户命名（如"字节跳动版"）
  createdAt: string;
  updatedAt: string;
  document: ResumeDocument;
  tags: string[];          // 标签（如"前端"、"P6"）
}

interface ResumeVault {
  versions: ResumeVersion[];
  activeVersionId: string;
}
```

#### 功能

- **创建版本**：保存当前简历为新版本
- **切换版本**：加载指定版本到编辑器
- **删除版本**：删除指定版本（至少保留 1 个）
- **重命名版本**：修改版本名称
- **打标签**：为版本添加标签
- **复制版本**：基于现有版本创建副本

#### 存储

- localStorage key: `reup:vault:<userId>`
- 最多保存 10 个版本（防止超出存储配额）
- 超出时提示用户删除旧版本

### 2.5 版本回滚

- 在 STAR 改写后，提供"回滚到原始版本"按钮
- 回滚时保留当前版本（创建副本）

---

## 3. 技术方案

### 3.1 架构

```
ResumeDocument
    ↓
ExportManager
    ├── MarkdownExporter (已有)
    ├── PDFExporter (react-pdf)
    └── WordExporter (docx)

ResumeVault
    ├── createVersion()
    ├── switchVersion()
    ├── deleteVersion()
    ├── renameVersion()
    └── duplicateVersion()

DiffEngine
    ├── diffBasic()
    ├── diffExperience()
    ├── diffSkills()
    └── generateFullDiff()
```

### 3.2 新增文件

| 文件 | 职责 |
|------|------|
| `src/lib/resume/export-pdf.ts` | PDF 导出（react-pdf） |
| `src/lib/resume/export-word.ts` | Word 导出（docx） |
| `src/lib/resume/diff.ts` | Diff 引擎 |
| `src/lib/resume/vault.ts` | 版本管理 |
| `src/lib/resume/export-pdf.test.ts` | PDF 导出测试 |
| `src/lib/resume/export-word.test.ts` | Word 导出测试 |
| `src/lib/resume/diff.test.ts` | Diff 引擎测试 |
| `src/lib/resume/vault.test.ts` | 版本管理测试 |

### 3.3 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/app/resume/page.tsx` | 新增导出按钮、版本管理 UI |
| `src/app/resume/_components/ExportButtons.tsx` | 扩展支持 PDF/Word |
| `src/app/resume/_components/DiffView.tsx` | 新增 Diff 视图组件 |
| `src/app/resume/_components/VersionManager.tsx` | 新增版本管理组件 |

---

## 4. 验收标准

### 4.1 PDF 导出

- [ ] 导出 PDF 文件可正常打开
- [ ] 中文显示正常（无乱码）
- [ ] 布局与模板一致
- [ ] 文件大小 < 2MB

### 4.2 Word 导出

- [ ] 导出 DOCX 文件可正常打开（Word/WPS）
- [ ] 基本格式保留（标题、列表、加粗）
- [ ] 中文显示正常

### 4.3 Diff 对比

- [ ] 新增内容高亮为绿色
- [ ] 删除内容高亮为红色
- [ ] 修改内容显示 old/new 对比
- [ ] 技能差集正确计算

### 4.4 版本管理

- [ ] 可创建 >= 5 个版本
- [ ] 版本切换后数据正确加载
- [ ] 删除版本后列表更新
- [ ] 超出配额时提示

### 4.5 测试

- [ ] `export-pdf.test.ts` >= 3 个测试
- [ ] `export-word.test.ts` >= 3 个测试
- [ ] `diff.test.ts` >= 8 个测试
- [ ] `vault.test.ts` >= 8 个测试
- [ ] 全量测试无回归

---

## 5. 风险

| 风险 | 缓解 |
|------|------|
| react-pdf 中文字体支持 | 使用自定义字体文件 |
| localStorage 配额不足 | 限制 10 个版本，压缩存储 |
| PDF 生成性能差 | 异步生成，显示 loading |
| Word 格式兼容性 | 使用标准 DOCX 特性 |

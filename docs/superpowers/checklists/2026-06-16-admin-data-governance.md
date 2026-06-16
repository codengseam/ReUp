# 管理后台与数据专项治理 Checklist

> 分支: `fix/admin-data-governance-optimization`
> 日期: 2026-06-16

## 问题一：向量库分段/章节名重命名（≤20字）

- [ ] 在 `admin-knowledge.ts` 中创建 `SECTION_TITLE_MAP` 映射表（151 entries → 精简名）
- [ ] 在 `admin-knowledge.ts` 中创建 `DOC_TITLE_MAP` 映射表（54 entries → 精简名）
- [ ] 在 `loadAllRecords()` 中应用映射转换
- [ ] 验证前端展示正确

## 问题二：Skills 框架内容修复

- [ ] 改造 `tryReadSkillMarkdown()` 路径解析为 `import.meta` 相对路径
- [ ] 增加 process.env.PROJECT_ROOT 环境变量支持
- [ ] 增加详细的错误日志便于排障
- [ ] 验证 8 个 SKILL.md 能正常加载

## 问题三：简历改写提示词显示默认值

- [ ] 新增 `/api/admin/config` GET `action=preview-default&kind=star` 端点
- [ ] 在 `prompt-tab.tsx` 的 STAR 改写 subtab 增加"预览默认提示词"按钮
- [ ] 预览时调用 API 获取动态生成的默认 system prompt
- [ ] 保留留空=回落到内置默认的行为

## 问题四：删除合规声明展示

- [ ] 在 `admin-knowledge.ts` 中创建 `stripComplianceNotice()` 函数
- [ ] 在 `toSummary()` 中调用 `stripComplianceNotice()` 过滤 preview
- [ ] 验证搜索结果和分组展示无合规声明

## 问题五：按书×分类页点击查看分段详情

- [ ] 在 `admin-knowledge.ts` 新增 `getChunkFullText(id)` 函数
- [ ] 在 knowledge API route 新增 `action=chunk-full-text` 处理
- [ ] 在 `knowledge-tab.tsx` 展开区域增加"查看全文"按钮
- [ ] 实现 modal 或内联展开显示完整文本
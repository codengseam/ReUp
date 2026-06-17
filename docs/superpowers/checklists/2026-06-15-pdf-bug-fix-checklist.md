# PDF Bug 修复 Checklist

**日期**: 2026-06-15
**Spec**: [2026-06-15-pdf-bug-fix-spec.md](../specs/2026-06-15-pdf-bug-fix-spec.md)
**状态**: In Progress

---

## 任务总览

| # | 任务 | 优先级 | 状态 | 负责人 |
|---|------|--------|------|--------|
| 1 | Spec 编写 | P0 | ✅ Done | Main |
| 2 | Checklist 编写 | P0 | ✅ Done | Main |
| 3 | **Agent 1**: parser-text.ts 修复 (B+C+D+E) | P0 | 🔄 Ready | Sub-agent |
| 4 | **Agent 2**: MatchReportCard.tsx 修复 (G+H) | P0 | 🔄 Ready | Sub-agent |
| 5 | **Agent 3**: ats.ts 修复 (I) | P1 | 🔄 Ready | Sub-agent |
| 6 | 汇总验证 (测试+lint+typecheck) | P0 | ⏳ Pending | Main |

---

## Agent 1: parser-text.ts 修复 (B+C+D+E)

### Bug B: 文末信息块识别
- [ ] 在 `splitSections` 末尾添加 `isTailInfoBlock` 检测
- [ ] 新增 `src/lib/resume/parser-text-tail-info.test.ts`
- [ ] 验证：文末含个人信息的 fixture → `basic.name` 非空
- [ ] 验证：现有 `parser-text.test.ts` 不回归

### Bug C: `|` 多 key-value 拆分
- [ ] 修改 `parseBasicSection`，对每行先按 `|` 拆 fragment
- [ ] 新增测试：单行 `|` 分隔 3 个 key-value 全部解析
- [ ] 验证：现有测试不回归

### Bug D: 技能长句拆分
- [ ] 修改 `parseSkillsSection`，BULLET_RE 失败时按句子切分
- [ ] 新增测试：长句技能段按 `;；。` 正确拆分
- [ ] 验证：现有测试不回归

### Bug E: 段落式经验切分
- [ ] 修改 `splitSubBlocks`，增加 `PERIOD_RE` 日期行检测
- [ ] 新增测试：2 段段落式经验正确拆分为 2 条
- [ ] 验证：现有测试不回归

---

## Agent 2: MatchReportCard.tsx 修复 (G+H)

### Bug G: severity 中文显示
- [ ] 添加 `SEVERITY_LABEL` 映射表
- [ ] 修改 `GapsCard` 渲染逻辑
- [ ] 更新 `MatchReportCard.test.tsx`：验证中文显示
- [ ] 验证：现有测试不回归

### Bug H: 空简历降级
- [ ] 修改 `MissingKeywordsCard`，添加 `resumeEmpty` 参数
- [ ] 在 `MatchReportCard` 中计算 `resumeEmpty`
- [ ] 新增测试：空简历状态显示降级提示
- [ ] 验证：现有测试不回归

---

## Agent 3: ats.ts 修复 (I)

### Bug I: TF 单字去噪
- [ ] 修改 `tfExtract`，过滤单字 CJK token
- [ ] 新增测试：`tfExtract` 输出不含单字 CJK
- [ ] 验证：`ats.benchmark.test.ts` avg coverage >= 85%
- [ ] 验证：现有 `ats.test.ts` 不回归

---

## 汇总验证

- [ ] `pnpm test` — 全部通过（651+ 新增测试）
- [ ] `pnpm lint` — 无新增错误
- [ ] `pnpm ts-check` — 无新增错误
- [ ] `pnpm test -- src/lib/resume/ats.benchmark.test.ts` — avg coverage >= 85%
- [ ] 手动抽查：上传真实 PDF fixture，验证 ParsePreview 显示正确

---

## 风险与规避

| 风险 | 影响 | 规避方案 |
|------|------|---------|
| parser-text.ts 改动过多导致回归 | 高 | 每个 Bug 独立测试，改完一个跑一遍全量 |
| ats.ts 去噪后 benchmark 下降 | 中 | 跑 benchmark 验证，若下降则调整阈值 |
| MatchReportCard 测试依赖英文 | 低 | 更新测试期望值为中文 |

---

## 提交规范

每个 Agent 完成后，按以下格式提交：

```
fix(resume): [Bug ID] 简短描述

- 修复内容
- 测试覆盖
```

示例：
```
fix(resume): B+C 文末信息块识别 + |多key拆分

- splitSections 增加 isTailInfoBlock 检测
- parseBasicSection 支持 | 分隔多 key-value
- 新增 parser-text-tail-info.test.ts
```

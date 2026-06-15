# Phase 3: 导出增强 + 版本管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善简历输出能力（PDF/Word 导出），支持多版本管理和改写历史对比。

**Architecture:** 新增 `export-pdf.ts` 和 `export-word.ts` 扩展导出能力，新增 `diff.ts` 和 `vault.ts` 支持版本管理，前端新增 DiffView 和 VersionManager 组件。

**Tech Stack:** Next.js 16 + React 19 + TypeScript 5 + Vitest 4 + react-pdf + docx

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/resume/export-pdf.tsx` | PDF 导出（react-pdf 组件） |
| `src/lib/resume/export-pdf.test.ts` | PDF 导出测试 |
| `src/lib/resume/export-word.ts` | Word 导出（docx） |
| `src/lib/resume/export-word.test.ts` | Word 导出测试 |
| `src/lib/resume/diff.ts` | Diff 引擎 |
| `src/lib/resume/diff.test.ts` | Diff 引擎测试 |
| `src/lib/resume/vault.ts` | 版本管理 |
| `src/lib/resume/vault.test.ts` | 版本管理测试 |
| `src/app/resume/_components/DiffView.tsx` | Diff 视图组件 |
| `src/app/resume/_components/VersionManager.tsx` | 版本管理组件 |
| `src/app/resume/_components/ExportButtons.tsx` | 扩展导出按钮（修改） |

---

## Task 1: Diff 引擎（TDD）

**Files:**
- Create: `src/lib/resume/diff.ts`
- Create: `src/lib/resume/diff.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
import { describe, it, expect } from 'vitest';
import { diffResume } from './diff';
import type { ResumeDocument } from './types';

describe('diffResume', () => {
  const base: ResumeDocument = {
    meta: { version: '1', source: 'text', createdAt: '' },
    basic: { name: '张三', title: '工程师' },
    experience: [{ company: 'A', role: 'R1', period: '2019-2021', bullets: ['b1', 'b2'] }],
    projects: [],
    skills: ['Java', 'Python'],
    education: [],
    raw: '',
  };

  it('detects added skills', () => {
    const updated = { ...base, skills: ['Java', 'Python', 'Go'] };
    const diff = diffResume(base, updated);
    expect(diff.skills.added).toEqual(['Go']);
    expect(diff.skills.removed).toEqual([]);
  });

  it('detects removed skills', () => {
    const updated = { ...base, skills: ['Java'] };
    const diff = diffResume(base, updated);
    expect(diff.skills.removed).toEqual(['Python']);
    expect(diff.skills.added).toEqual([]);
  });

  it('detects changed basic info', () => {
    const updated = { ...base, basic: { ...base.basic, title: '高级工程师' } };
    const diff = diffResume(base, updated);
    expect(diff.basic.changed.title).toEqual({ old: '工程师', new: '高级工程师' });
  });

  it('detects added experience', () => {
    const updated = {
      ...base,
      experience: [...base.experience, { company: 'B', role: 'R2', period: '2021-2023', bullets: [] }],
    };
    const diff = diffResume(base, updated);
    expect(diff.experience.added).toHaveLength(1);
    expect(diff.experience.added[0].company).toBe('B');
  });

  it('detects bullet changes', () => {
    const updated = {
      ...base,
      experience: [{ ...base.experience[0], bullets: ['b1', 'b3'] }],
    };
    const diff = diffResume(base, updated);
    const bulletDiff = diff.experience.changed[0].bulletDiff;
    expect(bulletDiff).toContainEqual({ type: 'removed', text: 'b2' });
    expect(bulletDiff).toContainEqual({ type: 'added', text: 'b3' });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace && pnpm test -- src/lib/resume/diff.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: 实现 diffResume**

```typescript
import type { ResumeDocument, ResumeExperience } from './types';

export interface ResumeDiff {
  basic: {
    added: Record<string, string>;
    removed: Record<string, string>;
    changed: Record<string, { old: string; new: string }>;
  };
  experience: {
    added: ResumeExperience[];
    removed: ResumeExperience[];
    changed: Array<{
      old: ResumeExperience;
      new: ResumeExperience;
      bulletDiff: Array<{ type: 'added' | 'removed'; text: string }>;
    }>;
  };
  skills: {
    added: string[];
    removed: string[];
  };
}

function diffArrays<T>(oldArr: T[], newArr: T[], keyFn: (item: T) => string): {
  added: T[];
  removed: T[];
  changed: Array<{ old: T; new: T }>;
} {
  const oldMap = new Map(oldArr.map(item => [keyFn(item), item]));
  const newMap = new Map(newArr.map(item => [keyFn(item), item]));

  const added = newArr.filter(item => !oldMap.has(keyFn(item)));
  const removed = oldArr.filter(item => !newMap.has(keyFn(item)));
  const changed = oldArr
    .filter(item => newMap.has(keyFn(item)))
    .map(item => ({ old: item, new: newMap.get(keyFn(item))! }));

  return { added, removed, changed };
}

function diffBullets(oldBullets: string[], newBullets: string[]): Array<{ type: 'added' | 'removed'; text: string }> {
  const oldSet = new Set(oldBullets);
  const newSet = new Set(newBullets);
  const result: Array<{ type: 'added' | 'removed'; text: string }> = [];

  for (const b of oldBullets) {
    if (!newSet.has(b)) result.push({ type: 'removed', text: b });
  }
  for (const b of newBullets) {
    if (!oldSet.has(b)) result.push({ type: 'added', text: b });
  }

  return result;
}

export function diffResume(old: ResumeDocument, newDoc: ResumeDocument): ResumeDiff {
  const basicChanged: ResumeDiff['basic']['changed'] = {};
  for (const key of Object.keys(newDoc.basic) as Array<keyof typeof newDoc.basic>) {
    if (old.basic[key] !== newDoc.basic[key]) {
      basicChanged[key] = { old: old.basic[key] ?? '', new: newDoc.basic[key] ?? '' };
    }
  }

  const expDiff = diffArrays(old.experience, newDoc.experience, e => e.company + e.role);
  const expChanged = expDiff.changed.map(({ old: o, new: n }) => ({
    old: o,
    new: n,
    bulletDiff: diffBullets(o.bullets, n.bullets),
  }));

  const oldSkills = new Set(old.skills);
  const newSkills = new Set(newDoc.skills);

  return {
    basic: {
      added: {},
      removed: {},
      changed: basicChanged,
    },
    experience: {
      added: expDiff.added,
      removed: expDiff.removed,
      changed: expChanged,
    },
    skills: {
      added: newDoc.skills.filter(s => !oldSkills.has(s)),
      removed: old.skills.filter(s => !newSkills.has(s)),
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace && pnpm test -- src/lib/resume/diff.test.ts --reporter=verbose`
Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/diff.ts src/lib/resume/diff.test.ts
git commit -m "feat(resume): add diff engine for version comparison"
```

---

## Task 2: 版本管理（TDD）

**Files:**
- Create: `src/lib/resume/vault.ts`
- Create: `src/lib/resume/vault.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createVault, addVersion, switchVersion, deleteVersion, renameVersion } from './vault';
import type { ResumeDocument } from './types';

describe('vault', () => {
  const mockDoc: ResumeDocument = {
    meta: { version: '1', source: 'text', createdAt: '' },
    basic: { name: '张三' },
    experience: [], projects: [], skills: [], education: [], raw: '',
  };

  it('creates vault with initial version', () => {
    const vault = createVault(mockDoc);
    expect(vault.versions).toHaveLength(1);
    expect(vault.versions[0].name).toBe('原始版本');
    expect(vault.activeVersionId).toBe(vault.versions[0].id);
  });

  it('adds new version', () => {
    let vault = createVault(mockDoc);
    vault = addVersion(vault, '字节版', mockDoc);
    expect(vault.versions).toHaveLength(2);
    expect(vault.versions[1].name).toBe('字节版');
  });

  it('switches active version', () => {
    let vault = createVault(mockDoc);
    vault = addVersion(vault, 'V2', mockDoc);
    const v2Id = vault.versions[1].id;
    vault = switchVersion(vault, v2Id);
    expect(vault.activeVersionId).toBe(v2Id);
  });

  it('deletes version', () => {
    let vault = createVault(mockDoc);
    vault = addVersion(vault, 'V2', mockDoc);
    const v2Id = vault.versions[1].id;
    vault = deleteVersion(vault, v2Id);
    expect(vault.versions).toHaveLength(1);
  });

  it('renames version', () => {
    let vault = createVault(mockDoc);
    const id = vault.versions[0].id;
    vault = renameVersion(vault, id, '新名字');
    expect(vault.versions[0].name).toBe('新名字');
  });

  it('does not delete last version', () => {
    let vault = createVault(mockDoc);
    vault = deleteVersion(vault, vault.versions[0].id);
    expect(vault.versions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace && pnpm test -- src/lib/resume/vault.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: 实现 vault**

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { ResumeDocument } from './types';

export interface ResumeVersion {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  document: ResumeDocument;
  tags: string[];
}

export interface ResumeVault {
  versions: ResumeVersion[];
  activeVersionId: string;
}

const MAX_VERSIONS = 10;

export function createVault(initialDoc: ResumeDocument): ResumeVault {
  const version: ResumeVersion = {
    id: uuidv4(),
    name: '原始版本',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    document: initialDoc,
    tags: [],
  };
  return {
    versions: [version],
    activeVersionId: version.id,
  };
}

export function addVersion(vault: ResumeVault, name: string, doc: ResumeDocument): ResumeVault {
  if (vault.versions.length >= MAX_VERSIONS) {
    throw new Error(`最多保存 ${MAX_VERSIONS} 个版本，请先删除旧版本`);
  }
  const version: ResumeVersion = {
    id: uuidv4(),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    document: doc,
    tags: [],
  };
  return {
    ...vault,
    versions: [...vault.versions, version],
    activeVersionId: version.id,
  };
}

export function switchVersion(vault: ResumeVault, versionId: string): ResumeVault {
  const exists = vault.versions.some(v => v.id === versionId);
  if (!exists) return vault;
  return { ...vault, activeVersionId: versionId };
}

export function deleteVersion(vault: ResumeVault, versionId: string): ResumeVault {
  if (vault.versions.length <= 1) return vault;
  const filtered = vault.versions.filter(v => v.id !== versionId);
  const newActive = filtered.some(v => v.id === vault.activeVersionId)
    ? vault.activeVersionId
    : filtered[0].id;
  return {
    ...vault,
    versions: filtered,
    activeVersionId: newActive,
  };
}

export function renameVersion(vault: ResumeVault, versionId: string, name: string): ResumeVault {
  return {
    ...vault,
    versions: vault.versions.map(v =>
      v.id === versionId ? { ...v, name, updatedAt: new Date().toISOString() } : v
    ),
  };
}

export function getActiveVersion(vault: ResumeVault): ResumeVersion | undefined {
  return vault.versions.find(v => v.id === vault.activeVersionId);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace && pnpm test -- src/lib/resume/vault.test.ts --reporter=verbose`
Expected: 6/6 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/vault.ts src/lib/resume/vault.test.ts
git commit -m "feat(resume): add version vault for multi-resume management"
```

---

## Task 3: PDF 导出

**Files:**
- Create: `src/lib/resume/export-pdf.tsx`
- Create: `src/lib/resume/export-pdf.test.ts`

- [ ] **Step 1: 安装依赖**

Run: `cd /workspace && pnpm add @react-pdf/renderer`

- [ ] **Step 2: 实现 PDF 导出组件**

```tsx
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';
import type { ResumeDocument } from './types';

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 11, fontFamily: 'Helvetica' },
  header: { fontSize: 18, marginBottom: 10, fontWeight: 'bold' },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 80, fontWeight: 'bold' },
  value: { flex: 1 },
  bullet: { marginLeft: 12, marginBottom: 2 },
});

function ResumePDF({ doc }: { doc: ResumeDocument }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{doc.basic.name || '未命名简历'}</Text>

        {doc.basic.title && (
          <View style={styles.row}>
            <Text style={styles.label}>职位:</Text>
            <Text style={styles.value}>{doc.basic.title}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>专业技能</Text>
          {doc.skills.map((s, i) => (
            <Text key={i} style={styles.bullet}>• {s}</Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>工作经历</Text>
          {doc.experience.map((e, i) => (
            <View key={i} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: 'bold' }}>{e.company} - {e.role}</Text>
              <Text style={{ color: '#666', fontSize: 10 }}>{e.period}</Text>
              {e.bullets.map((b, j) => (
                <Text key={j} style={styles.bullet}>• {b}</Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>教育经历</Text>
          {doc.education.map((e, i) => (
            <View key={i} style={{ marginBottom: 4 }}>
              <Text>{e.school} | {e.degree} | {e.period}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export function exportPDF(doc: ResumeDocument): JSX.Element {
  return <PDFDownloadLink document={<ResumePDF doc={doc} />} fileName="resume.pdf">
    {({ loading }) => loading ? '生成中...' : '下载 PDF'}
  </PDFDownloadLink>;
}
```

- [ ] **Step 3: 写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { exportPDF } from './export-pdf';
import type { ResumeDocument } from './types';

describe('exportPDF', () => {
  it('returns a React element', () => {
    const doc: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: '' },
      basic: { name: '张三', title: '工程师' },
      experience: [],
      projects: [],
      skills: ['Java'],
      education: [],
      raw: '',
    };
    const result = exportPDF(doc);
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/resume/export-pdf.tsx src/lib/resume/export-pdf.test.ts package.json pnpm-lock.yaml
git commit -m "feat(export): add PDF export via react-pdf"
```

---

## Task 4: Word 导出

**Files:**
- Create: `src/lib/resume/export-word.ts`
- Create: `src/lib/resume/export-word.test.ts`

- [ ] **Step 1: 安装依赖**

Run: `cd /workspace && pnpm add docx file-saver`

- [ ] **Step 2: 实现 Word 导出**

```typescript
import { Document, Paragraph, TextRun, Packer, HeadingLevel, BulletRun } from 'docx';
import { saveAs } from 'file-saver';
import type { ResumeDocument } from './types';

export async function exportWord(doc: ResumeDocument): Promise<void> {
  const children: Paragraph[] = [];

  // Header
  children.push(new Paragraph({
    text: doc.basic.name || '简历',
    heading: HeadingLevel.TITLE,
  }));

  if (doc.basic.title) {
    children.push(new Paragraph({ text: doc.basic.title }));
  }

  // Skills
  if (doc.skills.length > 0) {
    children.push(new Paragraph({ text: '专业技能', heading: HeadingLevel.HEADING_2 }));
    for (const skill of doc.skills) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `• ${skill}` })],
      }));
    }
  }

  // Experience
  if (doc.experience.length > 0) {
    children.push(new Paragraph({ text: '工作经历', heading: HeadingLevel.HEADING_2 }));
    for (const exp of doc.experience) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${exp.company} - ${exp.role}`, bold: true }),
        ],
      }));
      children.push(new Paragraph({ text: exp.period }));
      for (const bullet of exp.bullets) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `• ${bullet}` })],
        }));
      }
    }
  }

  // Education
  if (doc.education.length > 0) {
    children.push(new Paragraph({ text: '教育经历', heading: HeadingLevel.HEADING_2 }));
    for (const edu of doc.education) {
      children.push(new Paragraph({
        text: `${edu.school} | ${edu.degree} | ${edu.period}`,
      }));
    }
  }

  const document = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(document);
  saveAs(blob, 'resume.docx');
}
```

- [ ] **Step 3: 写测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { exportWord } from './export-word';
import type { ResumeDocument } from './types';

describe('exportWord', () => {
  it('generates docx blob without error', async () => {
    const doc: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: '' },
      basic: { name: '张三' },
      experience: [{ company: 'A', role: 'R', period: 'P', bullets: ['b'] }],
      projects: [],
      skills: ['Java'],
      education: [{ school: 'S', degree: 'D', period: 'P' }],
      raw: '',
    };

    // Mock file-saver
    const mockSaveAs = vi.fn();
    vi.doMock('file-saver', () => ({ saveAs: mockSaveAs }));

    await exportWord(doc);
    expect(mockSaveAs).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/resume/export-word.ts src/lib/resume/export-word.test.ts package.json pnpm-lock.yaml
git commit -m "feat(export): add Word export via docx"
```

---

## Task 5: 前端组件

**Files:**
- Create: `src/app/resume/_components/DiffView.tsx`
- Create: `src/app/resume/_components/VersionManager.tsx`
- Modify: `src/app/resume/_components/ExportButtons.tsx`

- [ ] **Step 1: 实现 DiffView 组件**

```tsx
'use client';
import type { ResumeDiff } from '@/lib/resume/diff';

export function DiffView({ diff }: { diff: ResumeDiff }) {
  return (
    <div className="space-y-4">
      {Object.keys(diff.basic.changed).length > 0 && (
        <div>
          <h3 className="font-bold">基本信息变更</h3>
          {Object.entries(diff.basic.changed).map(([key, val]) => (
            <div key={key} className="flex gap-2 text-sm">
              <span className="text-red-500 line-through">{val.old}</span>
              <span>→</span>
              <span className="text-green-500">{val.new}</span>
            </div>
          ))}
        </div>
      )}

      {diff.skills.added.length > 0 && (
        <div>
          <h3 className="font-bold">新增技能</h3>
          {diff.skills.added.map(s => (
            <span key={s} className="text-green-500 text-sm">+ {s}</span>
          ))}
        </div>
      )}

      {diff.skills.removed.length > 0 && (
        <div>
          <h3 className="font-bold">移除技能</h3>
          {diff.skills.removed.map(s => (
            <span key={s} className="text-red-500 line-through text-sm">- {s}</span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 实现 VersionManager 组件**

```tsx
'use client';
import { useState } from 'react';
import type { ResumeVault, ResumeVersion } from '@/lib/resume/vault';

export function VersionManager({
  vault,
  onSwitch,
  onDelete,
  onRename,
}: {
  vault: ResumeVault;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {vault.versions.map(v => (
        <div key={v.id} className={`flex items-center gap-2 p-2 rounded ${v.id === vault.activeVersionId ? 'bg-blue-50' : ''}`}>
          {editingId === v.id ? (
            <input
              defaultValue={v.name}
              onBlur={(e) => { onRename(v.id, e.target.value); setEditingId(null); }}
              autoFocus
              className="border rounded px-1"
            />
          ) : (
            <span className="flex-1 cursor-pointer" onClick={() => onSwitch(v.id)}>
              {v.name} {v.id === vault.activeVersionId && '(当前)'}
            </span>
          )}
          <button onClick={() => setEditingId(v.id)} className="text-xs text-gray-500">重命名</button>
          <button onClick={() => onDelete(v.id)} className="text-xs text-red-500">删除</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 扩展 ExportButtons**

在 `ExportButtons.tsx` 中添加 PDF 和 Word 导出按钮。

- [ ] **Step 4: Commit**

```bash
git add src/app/resume/_components/
git commit -m "feat(ui): add DiffView and VersionManager components"
```

---

## Task 6: 汇总验证

- [ ] **Step 1: 全量测试**

Run: `cd /workspace && pnpm test --silent`
Expected: >= 700 PASS

- [ ] **Step 2: Lint**

Run: `cd /workspace && pnpm lint`
Expected: 0 errors

- [ ] **Step 3: TypeCheck**

Run: `cd /workspace && pnpm ts-check`
Expected: PASS

- [ ] **Step 4: 最终 Commit**

```bash
git commit -m "feat(phase3): export enhancement + version management

- Add PDF export via react-pdf
- Add Word export via docx
- Add diff engine for version comparison
- Add version vault for multi-resume management
- Add DiffView and VersionManager UI components
- All 700+ tests pass, lint clean, typecheck clean"
```

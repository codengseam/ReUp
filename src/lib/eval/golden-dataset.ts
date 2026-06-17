// src/lib/eval/golden-dataset.ts
// M2: Golden 测试集管理 (人工标注的期望答案, 用于 judge 校准)

import { getDb } from '@/lib/db/connection';

export interface GoldenTest {
  id: number;
  query: string;
  expected_answer: string;
  expected_faithfulness: number | null;
  expected_relevancy: number | null;
  context_docs: string | null;
  category: string | null;
  difficulty: string;
  tags: string | null;
  created_at: number;
}

export type GoldenTestInput = Omit<GoldenTest, 'id' | 'created_at'>;

export function insertGoldenTest(test: GoldenTestInput): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO golden_tests
      (query, expected_answer, expected_faithfulness, expected_relevancy,
       context_docs, category, difficulty, tags)
    VALUES (@query, @expected_answer, @expected_faithfulness, @expected_relevancy,
            @context_docs, @category, @difficulty, @tags)
  `);
  const r = stmt.run({
    query: test.query,
    expected_answer: test.expected_answer,
    expected_faithfulness: test.expected_faithfulness,
    expected_relevancy: test.expected_relevancy,
    context_docs: test.context_docs,
    category: test.category,
    difficulty: test.difficulty ?? 'medium',
    tags: test.tags,
  });
  return Number(r.lastInsertRowid);
}

export function getAllGoldenTests(): GoldenTest[] {
  const db = getDb();
  return db.prepare('SELECT * FROM golden_tests ORDER BY id').all() as GoldenTest[];
}

export function getGoldenTestById(id: number): GoldenTest | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM golden_tests WHERE id = ?').get(id) as GoldenTest | undefined;
  return row ?? null;
}

export function getGoldenTestCount(): number {
  const db = getDb();
  const r = db.prepare('SELECT COUNT(*) AS c FROM golden_tests').get() as { c: number };
  return r.c;
}

export function deleteGoldenTest(id: number): void {
  getDb().prepare('DELETE FROM golden_tests WHERE id = ?').run(id);
}

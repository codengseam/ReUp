// src/lib/feedback-store.ts
// 阶段 4 Task 4.3：用户反馈（thumbsDown）持久化
// 设计目标：
//   1. 简单可靠：单文件 JSON + 内存缓存 + 写队列（不引 DB）
//   2. 失败隔离：写入失败只 console.error，不影响主流程
//   3. 测试友好：暴露 _resetForTest 清空内存缓存

import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';

export type FeedbackReason = 'good' | 'too_vague' | 'wrong' | 'unhelpful' | 'other';

export interface Feedback {
  id: string;
  messageId: string;
  conversationId: string;
  reason: FeedbackReason;
  comment?: string;
  query?: string;
  response?: string;
  createdAt: number;
}

const FILE = join(process.cwd(), 'feedback.json');
let buffer: Feedback[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Feedback[]> {
  if (buffer) return buffer;
  try {
    const raw = await readFile(FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    buffer = Array.isArray(parsed) ? (parsed as Feedback[]) : [];
  } catch {
    buffer = [];
  }
  return buffer!;
}

function flush(): Promise<void> {
  // 串行化写操作，避免并发覆盖
  writeQueue = writeQueue
    .then(async () => {
      if (buffer) {
        await writeFile(FILE, JSON.stringify(buffer, null, 2), 'utf-8');
      }
    })
    .catch((err) => {
      // 写失败不抛 — 反馈是 best-effort，不能影响主流程
      console.error('[feedback-store] write failed:', err);
    });
  return writeQueue;
}

export async function recordFeedback(
  input: Omit<Feedback, 'id' | 'createdAt'>
): Promise<Feedback> {
  const list = await load();
  const fb: Feedback = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  list.push(fb);
  await flush();
  return fb;
}

export async function listFeedback(): Promise<Feedback[]> {
  return [...(await load())];
}

// 仅供测试使用：清空内存缓存 + 删除磁盘文件，确保测试间隔离
export async function _resetForTest(): Promise<void> {
  // 等队列里所有挂起的写完成，避免 unlink 之后又被 in-flight write 重建文件
  await writeQueue;
  buffer = null;
  try {
    await unlink(FILE);
  } catch {
    // ENOENT 等视为正常
  }
}

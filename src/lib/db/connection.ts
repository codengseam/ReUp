// src/lib/db/connection.ts
// Loop Engineering 持久化层 (SQLite + WAL)
// - 单一连接 (better-sqlite3 同步模式, 服务端 Node.js 安全)
// - WAL: 写不阻塞读, 读不阻塞写
// - foreign_keys=ON: 启用外键约束

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'path';
import { SCHEMA } from './schema';

const DB_DIR = path.join(process.cwd(), 'data');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  // 关键: 在函数体内读 env, 支持测试在 import 之后通过 beforeEach 设置
  const DB_PATH = process.env.LOOP_ENGINEERING_DB ?? path.join(DB_DIR, 'loop-engineering.sqlite');
  mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  // 性能与并发: WAL 模式, NORMAL 同步, 5MB 内存 cache
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -5000');
  db.pragma('foreign_keys = ON');
  // 初始化 schema (IF NOT EXISTS 幂等)
  db.exec(SCHEMA);
  _db = db;
  return db;
}

/** 测试用: 重置单例 (并关闭连接) */
export function _resetDbForTest(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

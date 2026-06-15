'use client';
import { useState, useCallback, useEffect } from 'react';

/**
 * 通用 localStorage 持久化 Hook
 * 优先从 localStorage 读取，不存在则使用默认值
 */
export function useAdminState<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(defaultValue);
  const [initialized, setInitialized] = useState(false);

  // 初始化：从 localStorage 读取
  useEffect(() => {
    if (!initialized) {
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          const parsed = JSON.parse(stored) as T;
          setState(parsed);
        }
      } catch {
        // localStorage 读取失败，使用默认值
      }
      setInitialized(true);
    }
  }, [key, initialized]);

  // 写入：同步更新 state + localStorage
  const setAndPersist = useCallback((val: T | ((prev: T) => T)) => {
    setState(prev => {
      const next = typeof val === 'function' ? (val as (prev: T) => T)(prev) : val;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // localStorage 写入失败（如超出 5MB 限制）
      }
      return next;
    });
  }, [key]);

  return [state, setAndPersist];
}

/**
 * 记录活动日志到 localStorage
 */
export function logActivity(action: string, target: string) {
  try {
    const key = 'boss_admin_activity_log';
    const existing = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ action: string; target: string; time: string }>;
    existing.unshift({ action, target, time: new Date().toISOString() });
    // 只保留最近 20 条
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 20)));
  } catch {
    // 静默失败
  }
}

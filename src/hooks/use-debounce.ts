'use client';
import { useRef, useCallback, useEffect } from 'react';

/**
 * 返回一个防抖版本的 callback，delay 毫秒内重复调用会重置计时。
 * 返回的函数附带了 cancel() 方法用于取消等待中的调用。
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  // 通过 effect 保持 ref 与最新 callback 同步，避免在渲染阶段修改 ref
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // debouncedFn 与 cancel 共享同一个 timerRef。
  // 每次重渲时 useCallback 在依赖未变时返回稳定引用，挂载 cancel 只在首次 + 依赖变更时执行。
  // 在 useEffect 内挂载 cancel，避免在渲染阶段修改 useCallback 返回的稳定函数引用
  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (debouncedFn as typeof debouncedFn & { cancel: typeof cancel }).cancel = cancel;
  });

  return debouncedFn as typeof debouncedFn & { cancel: typeof cancel };
}
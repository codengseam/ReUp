// src/lib/resume/diff.ts
// Phase 5 — E2 line-level LCS diff for "查看差异" (original vs rewritten) panel.
//
// 设计要点:
// - 行级 LCS, 不做字符级 (避免单行内的微调触发整行 removed+added).
// - 输出顺序: 保持 original 的行序, 被删除的行直接跟在原位; 新增的行追加在最后一个
//   unchanged 之后 (forward + trailingAdded).
// - 空串视为空数组; 两者都空 → [].
// - 纯函数, 无外部依赖.
//
// DiffLine.type:
//   - 'unchanged': 两侧都有, 位置一致
//   - 'removed':   只在 original
//   - 'added':     只在 rewritten

export type DiffLineType = 'unchanged' | 'removed' | 'added';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Compute a line-level diff between two strings.
 * Splits on '\n' (does not produce a trailing empty line for '\n'-terminated input).
 * Empty inputs return [].
 */
export function computeLineDiff(original: string, rewritten: string): DiffLine[] {
  const a = splitLines(original);
  const b = splitLines(rewritten);
  if (a.length === 0 && b.length === 0) return [];
  return lcsDiff(a, b);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Split text on '\n'; empty input → []. A terminal '\n' is treated as a line
 *  break, NOT as producing a trailing empty line. */
function splitLines(s: string): string[] {
  if (s.length === 0) return [];
  const parts = s.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '' && s.endsWith('\n')) {
    parts.pop();
  }
  return parts;
}

/**
 * Standard dynamic-programming LCS-based diff. O(n*m) memory; fine for resume
 * text (typically n, m < 200 lines).
 */
function lcsDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;

  // Build the LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i]![j] = (dp[i + 1]?.[j + 1] ?? 0) + 1;
      } else {
        const down = dp[i + 1]?.[j] ?? 0;
        const right = dp[i]?.[j + 1] ?? 0;
        dp[i]![j] = down >= right ? down : right;
      }
    }
  }

  // Walk forward to produce a stable, readable diff. Order: keep original order,
  // emit removed inline; emit added inline if the previous emit was unchanged/
  // removed, else defer to `trailingAdded` so additions appear after the
  // matched block.
  const forward: DiffLine[] = [];
  const trailingAdded: DiffLine[] = [];
  let lastWasUnchangedOrRemoved = false;

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      forward.push({ type: 'unchanged', text: a[i]! });
      i++;
      j++;
      lastWasUnchangedOrRemoved = true;
    } else {
      const down = dp[i + 1]?.[j] ?? 0;
      const right = dp[i]?.[j + 1] ?? 0;
      if (down >= right) {
        // Skip a[i] (remove)
        forward.push({ type: 'removed', text: a[i]! });
        i++;
        lastWasUnchangedOrRemoved = true;
      } else {
        // Take b[j] (add)
        if (lastWasUnchangedOrRemoved) {
          forward.push({ type: 'added', text: b[j]! });
        } else {
          trailingAdded.push({ type: 'added', text: b[j]! });
        }
        j++;
      }
    }
  }
  // Drain remaining originals (all removed)
  while (i < n) {
    forward.push({ type: 'removed', text: a[i]! });
    i++;
    lastWasUnchangedOrRemoved = true;
  }
  // Drain remaining rewrittens (all added)
  while (j < m) {
    if (lastWasUnchangedOrRemoved) {
      forward.push({ type: 'added', text: b[j]! });
    } else {
      trailingAdded.push({ type: 'added', text: b[j]! });
    }
    j++;
  }

  void lastWasUnchangedOrRemoved;
  return forward.concat(trailingAdded);
}

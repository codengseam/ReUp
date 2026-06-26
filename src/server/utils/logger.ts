// src/server/utils/logger.ts
// 极简结构化日志: 生产环境输出 JSON Lines (stdout/stderr),
// 开发环境输出人类可读的彩色行。
//
// 设计:
// - 单例 `logger` + `logger.child({ requestId })` 派生带固定字段的子 logger。
// - 每行: {"ts":"2026-06-26T...","level":"info","msg":"...","fields":{...}}
// - 不引入 pino/winston 等依赖 (手写, 零依赖)。
// - NODE_ENV=production → JSON; 否则 → 彩色文本。
// - error → stderr; info/warn → stdout。
// - 模块加载无副作用; 仅在调用时读取 NODE_ENV, 便于测试切换。

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** 派生子 logger, 将 `fields` 合并进后续每条日志的 fields。 */
  child(fields: LogFields): Logger;
}

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
} as const;

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: ANSI.green,
  warn: ANSI.yellow,
  error: ANSI.red,
};

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function hasFields(fields: LogFields): boolean {
  for (const key in fields) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) return true;
  }
  return false;
}

function formatJson(level: LogLevel, msg: string, fields: LogFields): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    fields,
  });
}

function formatDev(level: LogLevel, msg: string, fields: LogFields): string {
  const ts = new Date().toISOString();
  const color = LEVEL_COLOR[level];
  const levelTag = `${color}${level.toUpperCase().padEnd(5)}${ANSI.reset}`;
  let line = `${ANSI.dim}${ts}${ANSI.reset} ${levelTag} ${msg}`;
  if (hasFields(fields)) {
    line += ` ${ANSI.dim}${JSON.stringify(fields)}${ANSI.reset}`;
  }
  return line;
}

function emit(level: LogLevel, msg: string, fields: LogFields): void {
  const line = isProduction()
    ? formatJson(level, msg, fields)
    : formatDev(level, msg, fields);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

function createLogger(baseFields: LogFields): Logger {
  return {
    info(msg: string, fields?: LogFields): void {
      emit('info', msg, { ...baseFields, ...fields });
    },
    warn(msg: string, fields?: LogFields): void {
      emit('warn', msg, { ...baseFields, ...fields });
    },
    error(msg: string, fields?: LogFields): void {
      emit('error', msg, { ...baseFields, ...fields });
    },
    child(fields: LogFields): Logger {
      return createLogger({ ...baseFields, ...fields });
    },
  };
}

/** 默认单例 logger。用 `logger.child({ requestId })` 派生请求级 logger。 */
export const logger: Logger = createLogger({});

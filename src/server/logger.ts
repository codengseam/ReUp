// src/server/logger.ts
// Structured JSON logger with traceId support

export interface LogContext {
  traceId?: string;
  duration?: number;
  userId?: string;
  module?: string;
  [key: string]: unknown;
}

interface LogEntry extends LogContext {
  level: 'info' | 'warn' | 'error' | 'debug';
  ts: string;
  msg: string;
  error?: {
    message: string;
    stack: string | undefined;
  };
}

export function generateTraceId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function writeLog(entry: LogEntry): void {
  // JSON Lines to stdout, one JSON object per line
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export function createLogger(module: string): {
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: Error, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
} {
  function baseLog(level: LogEntry['level'], msg: string, ctx: LogContext = {}): void {
    const entry: LogEntry = {
      level,
      ts: new Date().toISOString(),
      module,
      msg,
      ...ctx,
    };
    writeLog(entry);
  }

  return {
    info(msg: string, ctx?: LogContext): void {
      baseLog('info', msg, ctx);
    },

    warn(msg: string, ctx?: LogContext): void {
      baseLog('warn', msg, ctx);
    },

    error(msg: string, err?: Error, ctx?: LogContext): void {
      const error = err
        ? {
            message: err.message,
            stack: err.stack,
          }
        : undefined;
      baseLog('error', msg, { ...ctx, error });
    },

    debug(msg: string, ctx?: LogContext): void {
      baseLog('debug', msg, ctx);
    },
  };
}

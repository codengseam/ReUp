declare module 'langfuse' {
  export interface LangfuseTrace {
    id: string;
    generation(...args: unknown[]): unknown;
    span(...args: unknown[]): unknown;
  }

  export class Langfuse {
    constructor(options: Record<string, unknown>);
    trace(...args: unknown[]): LangfuseTrace;
  }
}

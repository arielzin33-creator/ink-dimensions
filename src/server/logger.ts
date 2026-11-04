// Structured JSON logging: one object per line on stdout. Every line carries the release,
// so errors can be traced to a build. Never log passwords, tokens, image bytes or plot text.
import type { LogLevel } from './config.js';

export type LogFields = Record<string, unknown>;
export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) return { err: { name: err.name, message: err.message, stack: err.stack } };
  return { err: { message: String(err) } };
}

export function createLogger(opts: {
  level: LogLevel;
  release: string;
  write?: (line: string) => void;
  base?: LogFields;
}): Logger {
  const write = opts.write ?? ((line: string) => process.stdout.write(line + '\n'));
  const base = opts.base ?? {};
  const log = (level: Exclude<LogLevel, 'silent'>, msg: string, fields?: LogFields) => {
    if (ORDER[level] < ORDER[opts.level]) return;
    write(JSON.stringify({ ts: new Date().toISOString(), level, msg, release: opts.release, ...base, ...fields }));
  };
  return {
    debug: (m, f) => log('debug', m, f),
    info: (m, f) => log('info', m, f),
    warn: (m, f) => log('warn', m, f),
    error: (m, f) => log('error', m, f),
    child: (fields) => createLogger({ ...opts, write, base: { ...base, ...fields } }),
  };
}

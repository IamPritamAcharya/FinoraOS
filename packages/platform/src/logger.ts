export type LogContext = Record<string, unknown>;
export interface PlatformLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const log = (level: string, message: string, context?: LogContext) =>
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, message, ...context }));

export const logger: PlatformLogger = {
  debug: (message, context) => log('debug', message, context),
  info: (message, context) => log('info', message, context),
  warn: (message, context) => log('warn', message, context),
  error: (message, context) => log('error', message, context),
};

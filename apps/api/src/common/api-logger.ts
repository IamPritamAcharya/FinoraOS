import pino from 'pino';
import { Writable } from 'node:stream';
import { requestContext } from './request-context.js';

export type ApiLogContext = Record<string, unknown>;

type PinoRecord = Record<string, unknown> & { level?: number; msg?: string; time?: string };

const isDevelopment = process.env.NODE_ENV !== 'production';
const useColor = isDevelopment && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const hiddenLogFields = new Set([
  'level',
  'time',
  'pid',
  'hostname',
  'msg',
  'service',
  'requestId',
]);

const formatValue = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

const ansi = {
  reset: '\u001B[0m',
  dim: '\u001B[2m',
  bold: '\u001B[1m',
  blue: '\u001B[34m',
  cyan: '\u001B[36m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  red: '\u001B[31m',
} as const;

const paint = (value: string, color: keyof typeof ansi) =>
  useColor ? `${ansi[color]}${value}${ansi.reset}` : value;

const levelColor = (level: string): keyof typeof ansi => {
  const colors: Record<string, keyof typeof ansi> = {
    DEBUG: 'cyan',
    INFO: 'blue',
    WARN: 'yellow',
    ERROR: 'red',
  };
  return colors[level] ?? 'blue';
};

const statusColor = (statusCode: number) =>
  (statusCode >= 500
    ? 'red'
    : statusCode >= 400
      ? 'yellow'
      : statusCode >= 300
        ? 'cyan'
        : 'green') as keyof typeof ansi;

const developmentDestination = new Writable({
  write(chunk, _encoding, callback) {
    try {
      const record = JSON.parse(chunk.toString()) as PinoRecord;
      const timestamp = String(record.time ?? '').slice(11, 19);
      const level = pino.levels.labels[Number(record.level)]?.toUpperCase() ?? 'INFO';
      const requestId =
        typeof record.requestId === 'string'
          ? ` ${paint(`req=${record.requestId.slice(0, 8)}`, 'dim')}`
          : '';
      const context = Object.entries(record)
        .filter(([key, value]) => !hiddenLogFields.has(key) && value !== undefined)
        .map(([key, value]) => `${key}=${formatValue(value)}`)
        .join(' ');
      if (record.msg === 'HTTP request completed') {
        process.stdout.write(
          `${paint(timestamp, 'dim')} ${paint(level.padEnd(5), levelColor(level))} ${paint('HTTP', 'bold')} ${paint(String(record.statusCode), statusColor(Number(record.statusCode)))} ${record.method} ${record.path} ${paint(`${record.durationMs}ms`, 'dim')}${requestId}\n`,
        );
      } else {
        process.stdout.write(
          `${paint(timestamp, 'dim')} ${paint(level.padEnd(5), levelColor(level))} ${record.msg ?? 'FinoraOS event'}${context ? ` ${paint(context, 'dim')}` : ''}${requestId}\n`,
        );
      }
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error('Unable to format development log.'));
    }
  },
});

const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    base: { service: 'finora-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'apiKey',
        'api_key',
        'authorization',
        'headers.authorization',
        'headers["x-goog-api-key"]',
        'GEMINI_API_KEY',
        'GROQ_API_KEY',
        'OPENROUTER_API_KEY',
        'RAZORPAY_KEY_SECRET',
      ],
      censor: '[REDACTED]',
    },
  },
  isDevelopment ? developmentDestination : undefined,
);

const withRequestContext = (context?: ApiLogContext) => ({
  requestId: requestContext.get()?.requestId,
  ...context,
});

export const apiLogger = {
  debug(message: string, context?: ApiLogContext) {
    logger.debug(withRequestContext(context), message);
  },
  info(message: string, context?: ApiLogContext) {
    logger.info(withRequestContext(context), message);
  },
  warn(message: string, context?: ApiLogContext) {
    logger.warn(withRequestContext(context), message);
  },
  error(message: string, context?: ApiLogContext) {
    logger.error(withRequestContext(context), message);
  },
};

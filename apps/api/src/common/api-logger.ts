import pino from 'pino';
import { requestContext } from './request-context.js';

export type ApiLogContext = Record<string, unknown>;

const logger = pino({
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
});

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

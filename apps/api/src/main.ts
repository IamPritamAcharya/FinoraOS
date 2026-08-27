import './common/environment.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { apiLogger } from './common/api-logger.js';
import { requestContext } from './common/request-context.js';
import { AppModule } from './app.module.js';
import { AuthService } from './modules/auth/auth.service.js';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const auth = app.get(AuthService);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.use(async (request: Request, response: Response, next: () => void) => {
    const requestId = request.header('x-request-id') ?? randomUUID();
    const startedAt = performance.now();
    response.setHeader('x-request-id', requestId);
    response.once('finish', () => {
      apiLogger.info('HTTP request completed', {
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    try {
      const principal = await auth.resolvePrincipal(request.header('authorization'));
      requestContext.run({ requestId, principal }, next);
    } catch (error) {
      response.status(401).json({
        statusCode: 401,
        message: error instanceof Error ? error.message : 'Unauthorized',
      });
    }
  });
  await app.listen(Number(process.env.PORT ?? 3001));
  apiLogger.info('FinoraOS API ready', {
    url: `http://localhost:${process.env.PORT ?? 3001}/api`,
  });
}
void bootstrap();

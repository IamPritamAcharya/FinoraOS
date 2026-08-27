import { resolve } from 'node:path';

try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

process.env.NODE_ENV = process.argv[2] === 'build' ? 'production' : 'development';
await import('../node_modules/next/dist/bin/next');

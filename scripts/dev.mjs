import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:net';

const pnpmEntrypoint = process.env.npm_execpath;
if (!pnpmEntrypoint) throw new Error('Run this command through pnpm: pnpm dev');

const run = (args, inherited = true) =>
  spawn(process.execPath, [pnpmEntrypoint, ...args], {
    stdio: inherited ? 'inherit' : 'pipe',
    env: process.env,
  });
const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(resolve(rootDirectory, '.env'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const runWorkspaceProcess = (workingDirectory, args) =>
  spawn(process.execPath, args, {
    cwd: resolve(rootDirectory, workingDirectory),
    stdio: 'inherit',
    env: process.env,
    detached: true,
  });

const wait = (child) =>
  new Promise((resolve) => {
    // A Ctrl+C reaches child processes and this parent at nearly the same time.
    // Never wait for an exit event that has already happened.
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode ?? 0);
      return;
    }
    child.once('exit', (code) => resolve(code ?? 1));
  });

const assertPortAvailable = (port, service) =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `${service} port ${port} is already in use. Stop the previous FinoraOS dev process, then run pnpm dev again.`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });

let stopping = false;
let children = [];
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    // Next starts a server child of its launcher. Each app gets its own process
    // group so shutdown never leaves that server listening on the old port.
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  });
  await Promise.all(children.map(wait));
  if (process.env.FINORA_KEEP_INFRA !== '1') {
    await wait(run(['infra:down']));
  }
  process.exit(code);
}

// pnpm forwards Ctrl+C after the terminal already delivered SIGINT to this
// process. Keep these listeners installed so the duplicate signal cannot
// restore Node's default handler halfway through Docker cleanup.
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

async function main() {
  if (process.argv.includes('--services-only')) {
    if ((await wait(run(['infra:up']))) !== 0) process.exit(1);
    process.exit(await wait(run(['auth:configure'])));
  }
  try {
    await assertPortAvailable(3000, 'Web');
    await assertPortAvailable(3001, 'API');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  if ((await wait(run(['infra:up']))) !== 0) return shutdown(1);
  if ((await wait(run(['auth:configure']))) !== 0) return shutdown(1);
  if ((await wait(run(['db:deploy']))) !== 0) return shutdown(1);
  if ((await wait(run(['db:agent-role']))) !== 0) return shutdown(1);
  if (process.env.FINORA_SEED_ON_DEV !== '0' && (await wait(run(['db:seed:if-empty']))) !== 0) {
    return shutdown(1);
  }
  children = [
    runWorkspaceProcess('apps/api', [
      '--watch',
      '--watch-preserve-output',
      '--loader',
      'ts-node/esm',
      '--no-warnings',
      'src/main.ts',
    ]),
    runWorkspaceProcess('apps/web', [
      resolve(rootDirectory, 'apps/web/node_modules/next/dist/bin/next'),
      'dev',
      '--port',
      '3000',
    ]),
  ];
  await shutdown(await Promise.race(children.map(wait)));
}

void main();

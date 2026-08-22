import { spawn } from 'node:child_process';

const pnpmEntrypoint = process.env.npm_execpath;
if (!pnpmEntrypoint) throw new Error('Run this command through pnpm: pnpm dev');

const run = (args: string[], inherited = true) =>
  spawn(process.execPath, [pnpmEntrypoint, ...args], {
    stdio: inherited ? 'inherit' : 'pipe',
    env: process.env,
  });
const wait = (child: ReturnType<typeof spawn>) =>
  new Promise<number>((resolve) => child.once('exit', (code) => resolve(code ?? 1)));

let stopping = false;
let children: ReturnType<typeof spawn>[] = [];
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill('SIGTERM'));
  await Promise.all(children.map(wait));
  if (process.env.FINORA_KEEP_INFRA !== '1') await wait(run(['infra:down']));
  process.exit(code);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

async function main() {
  if (process.argv.includes('--services-only')) {
    const status = await wait(run(['infra:up']));
    process.exit(status);
  }
  if ((await wait(run(['infra:up']))) !== 0) return shutdown(1);
  if ((await wait(run(['db:deploy']))) !== 0) return shutdown(1);
  if (process.env.FINORA_SEED_ON_DEV !== '0' && (await wait(run(['db:seed']))) !== 0)
    return shutdown(1);
  children = [run(['--filter', '@finora/api', 'dev']), run(['--filter', '@finora/web', 'dev'])];
  const exited = await Promise.race(children.map(wait));
  await shutdown(exited);
}

void main();

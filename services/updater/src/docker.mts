import { spawn } from 'node:child_process';
import { requireThat, UpdateError } from './release.mts';

export async function run(command: string, args: string[], options: { input?: string | Uint8Array; timeout?: number; maxOutput?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe','pipe','pipe'], env: { ...process.env, DOCKER_CONFIG: '/tmp/pulse-docker', COMPOSE_DISABLE_ENV_FILE: 'true' } });
    const chunks: Buffer[] = []; let size = 0, overflow = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, options.timeout ?? 1_800_000);
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > (options.maxOutput ?? 8_000_000)) { overflow = true; child.kill('SIGKILL'); } else chunks.push(chunk); });
    // Docker/Prisma output can contain connection URLs. Never expose raw stderr
    // through the control API or persist it in the public job journal.
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new UpdateError('COMMAND_UNAVAILABLE')); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0 || overflow) reject(new UpdateError(overflow ? 'COMMAND_OUTPUT_LIMIT' : 'OPERATION_FAILED')); else resolve(Buffer.concat(chunks).toString('utf8')); });
    child.stdin.on('error', () => {});
    child.stdin.end(options.input);
  });
}
export const docker = (args: string[], options?: Parameters<typeof run>[2]) => run('docker', args, options);
export const compose = (file: string, env: string, args: string[], project?: string) => docker(['compose', ...(project ? ['--project-name',project] : []), '--env-file',env,'-f',file,...args]);
export async function containerId(file: string, env: string, service: string) { const id = (await compose(file,env,['ps','-a','-q',service])).trim(); requireThat(/^[a-f0-9]{12,64}$/.test(id), 'CONTAINER_NOT_FOUND'); return id; }
export async function inspect(id: string): Promise<any> { return JSON.parse(await docker(['inspect',id]))[0]; }
export async function requireSupportedDocker() {
  const info = JSON.parse(await docker(['info','--format','{{json .}}']));
  requireThat(info.OSType === 'linux' && ['x86_64','amd64'].includes(info.Architecture),'UNSUPPORTED_DOCKER_PLATFORM');
}

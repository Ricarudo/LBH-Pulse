import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Manifest } from './release.mts';
import { requireThat } from './release.mts';

export const terminal = new Set(['succeeded', 'failed', 'recovered']);
export type Stage = 'queued' | 'preflight' | 'downloading' | 'maintenance' | 'backup' | 'restore-verification' | 'migrating' | 'starting' | 'verifying' | 'updater-handoff' | 'succeeded' | 'failed' | 'recovery-required' | 'recovered';
export type Job = { id: string; releaseId: string; idempotencyKey: string; actor: { id: string; name: string }; stage: Stage; createdAt: string; updatedAt: string; migrationStarted: boolean; localRelease?: boolean; source: Manifest; statusToken: string; error?: string; backup?: string; fingerprint?: string; backupVerified?: boolean; restoreProject?: string; recovery?: { project: string; postgres: string; minio: string; verified: boolean }; events: { at: string; stage: Stage }[] };
export type Installation = { id: string; project: string; mode: 'internal'|'lan'|'public'; hostname: string; url: string; backupSource: string; installed: Manifest; postgresVolume: string; minioVolume: string; caddyDataVolume: string; caddyConfigVolume: string; initialized: boolean; adopted?: boolean };
export function atomicWrite(path: string, value: string | Uint8Array, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', mode);
  try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const directory = openSync(dirname(path), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
}
export class Store {
  root: string;
  constructor(root = '/state') { this.root = root; }
  path(name: string) { requireThat(/^[a-zA-Z0-9_./-]+$/.test(name) && !name.includes('..'), 'INVALID_STATE_PATH'); return join(this.root, name); }
  read<T>(name: string): T | null { const path = this.path(name); return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : null; }
  write(name: string, value: unknown) { atomicWrite(this.path(name), JSON.stringify(value, null, 2) + '\n'); }
  installation(): Installation { const state = this.read<Installation>('installation.json'); requireThat(state?.initialized, 'INSTALLATION_NOT_READY'); return state; }
  job(id: string): Job { requireThat(/^[a-f0-9-]{36}$/.test(id), 'INVALID_JOB_ID'); const job = this.read<Job>(`jobs/${id}.json`); requireThat(job, 'JOB_NOT_FOUND'); return job; }
  save(job: Job) { job.updatedAt = new Date().toISOString(); this.write(`jobs/${job.id}.json`, job); this.write('active.json', { id: job.id }); }
  stage(job: Job, stage: Stage) { job.stage = stage; job.events.push({ at: new Date().toISOString(), stage }); this.save(job); }
  active(): Job | null { const ref = this.read<{id: string}>('active.json'); return ref ? this.job(ref.id) : null; }
}
export function publicJob(job: Job) {
  return { id: job.id, releaseId: job.releaseId, actor: job.actor, stage: job.stage, createdAt: job.createdAt, updatedAt: job.updatedAt, error: job.error ?? null, events: job.events, recoveryRequired: job.stage === 'recovery-required', backupVerified: job.backupVerified === true };
}

import type { Job } from './store.mts';
import { Store } from './store.mts';
import { UpdateError } from './release.mts';

export interface Operations {
  preflight(job: Job): Promise<void>; download(job: Job): Promise<void>;
  maintenance(job: Job): Promise<void>; backup(job: Job): Promise<void>;
  verifyBackup(job: Job): Promise<void>; migrate(job: Job): Promise<void>;
  start(job: Job): Promise<void>; verify(job: Job): Promise<void>;
  handoff(job: Job): Promise<void>; commit(job: Job): Promise<void>;
  rollback(job: Job): Promise<void>; publish(job: Job, maintenance: boolean): void;
}
// Every external side effect is preceded by a durable transition. In particular,
// a lost migration subprocess is never retried based only on its missing result.
export async function executeUpdate(store: Store, job: Job, ops: Operations) {
  try {
    for (const [stage, action] of [
      ['preflight','preflight'], ['downloading','download'], ['maintenance','maintenance'],
      ['backup','backup'], ['restore-verification','verifyBackup'], ['migrating','migrate'],
      ['starting','start'], ['verifying','verify'], ['updater-handoff','handoff']
    ] as const) {
      if (stage === 'migrating') { job.migrationStarted = true; store.save(job); }
      store.stage(job, stage);
      ops.publish(job, !['preflight','downloading'].includes(stage));
      await ops[action](job);
    }
    await ops.commit(job);
    store.stage(job, 'succeeded');
    ops.publish(job, false);
  } catch (error) {
    job.error = error instanceof UpdateError ? error.code : 'UPDATE_FAILED';
    if (!job.migrationStarted) {
      try { await ops.rollback(job); store.stage(job, 'failed'); ops.publish(job, false); return; }
      catch { job.error = 'ROLLBACK_VERIFICATION_REQUIRED'; }
    }
    store.stage(job, 'recovery-required');
    ops.publish(job, true);
  }
}
export async function reconcileInterrupted(store: Store, job: Job, ops: Operations) {
  if (['succeeded','failed','recovered'].includes(job.stage)) return;
  job.error = 'UPDATE_INTERRUPTED';
  if (!job.migrationStarted) {
    try { await ops.rollback(job); store.stage(job, 'failed'); ops.publish(job, false); return; }
    catch { job.error = 'ROLLBACK_VERIFICATION_REQUIRED'; }
  }
  store.stage(job, 'recovery-required'); ops.publish(job, true);
}

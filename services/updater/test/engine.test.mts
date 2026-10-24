import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mts';
import type { Job } from '../src/store.mts';
import { executeUpdate, reconcileInterrupted } from '../src/engine.mts';
import type { Operations } from '../src/engine.mts';
import { release } from './fixtures.mts';
import { randomUUID } from 'node:crypto';

function fixture(fail?: string, rollbackFails = false) {
  const root = mkdtempSync(join(tmpdir(),'pulse-engine-')); const store = new Store(root);
  const job: Job = {id:randomUUID(),releaseId:'0.2.0',idempotencyKey:'test-idempotency-key',actor:{id:'admin',name:'Admin'},stage:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),migrationStarted:false,source:release('0.1.2'),statusToken:'token',events:[]};
  store.save(job); const calls: string[] = []; let gate = false;
  const ops = {publish(_job:Job,maintenance:boolean) { gate = maintenance; }} as Operations;
  for (const name of ['preflight','download','maintenance','backup','verifyBackup','migrate','start','verify','handoff','commit','rollback'] as const) ops[name] = async () => {
    calls.push(name);
    if (name === 'migrate') assert.equal(store.job(job.id).migrationStarted,true);
    if (['backup','verifyBackup','migrate','start','verify','handoff'].includes(name)) assert.equal(gate,true);
    if (name === fail || (name === 'rollback' && rollbackFails)) throw new Error('injected failure with secret that must not be persisted');
  };
  return {store,job,ops,calls,gate:()=>gate,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('quiesces before backup and proves restore before touching schema',async () => {
  const f = fixture(); try {
    await executeUpdate(f.store,f.job,f.ops);
    assert.deepEqual(f.calls,['preflight','download','maintenance','backup','verifyBackup','migrate','start','verify','handoff','commit']);
    assert.equal(f.store.job(f.job.id).stage,'succeeded'); assert.equal(f.gate(),false);
  } finally { f.cleanup(); }
});
for (const stage of ['preflight','download','maintenance','backup','verifyBackup']) test(`failure at ${stage} rolls back before migration`,async () => {
  const f = fixture(stage); try {
    await executeUpdate(f.store,f.job,f.ops); assert.equal(f.store.job(f.job.id).stage,'failed'); assert.ok(f.calls.includes('rollback')); assert.ok(!f.calls.includes('migrate')); assert.equal(f.gate(),false);
  } finally { f.cleanup(); }
});
for (const stage of ['migrate','start','verify','handoff','commit']) test(`failure at ${stage} preserves data and requires recovery`,async () => {
  const f = fixture(stage); try {
    await executeUpdate(f.store,f.job,f.ops); assert.equal(f.store.job(f.job.id).stage,'recovery-required'); assert.ok(!f.calls.includes('rollback')); assert.equal(f.gate(),true); assert.equal(f.job.error,'UPDATE_FAILED');
  } finally { f.cleanup(); }
});
test('a failed rollback never opens the maintenance gate',async () => {
  const f = fixture('backup',true); try { await executeUpdate(f.store,f.job,f.ops); assert.equal(f.job.stage,'recovery-required'); assert.equal(f.gate(),true); } finally { f.cleanup(); }
});
test('restart after a migration intent never replays the migration',async () => {
  const f = fixture(); try {
    f.job.migrationStarted = true; f.store.stage(f.job,'migrating'); await reconcileInterrupted(f.store,f.job,f.ops);
    assert.deepEqual(f.calls,[]); assert.equal(f.job.stage,'recovery-required'); assert.equal(f.gate(),true);
  } finally { f.cleanup(); }
});
test('restart before a migration verifies rollback before reopening access',async () => {
  const f = fixture(); try {
    f.store.stage(f.job,'backup'); await reconcileInterrupted(f.store,f.job,f.ops);
    assert.deepEqual(f.calls,['rollback']); assert.equal(f.job.stage,'failed'); assert.equal(f.gate(),false);
  } finally { f.cleanup(); }
});

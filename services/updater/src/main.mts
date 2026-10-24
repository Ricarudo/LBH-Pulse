import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { Store, atomicWrite, publicJob } from './store.mts';
import { requireThat, UpdateError } from './release.mts';
import { DockerOperations } from './operations.mts';
import { executeUpdate, reconcileInterrupted } from './engine.mts';
import { initialize, adopt, importBundle, importCompatibility, finalizeSetup } from './bootstrap.mts';
import { makeJob, serve, statusServer, launchWorker } from './server.mts';
import { compose, docker, run } from './docker.mts';
import { managerCompose } from './compose.mts';
import { randomUUID } from 'node:crypto';

const store = new Store();
const keys: string[] = JSON.parse(readFileSync(new URL('../trusted-keys.json',import.meta.url),'utf8'));
const command = process.argv[2];
async function main() {
  if (command === 'ping' || command === 'status-ping') { const response = await fetch(`http://127.0.0.1:${command === 'ping' ? 9050 : 9051}/live`,{signal:AbortSignal.timeout(2000)}); requireThat(response.ok,'NOT_READY'); return; }
  if (command === 'status-server') { statusServer(); return; }
  if (command === 'serve') {
    await serve(store,keys);
    const finalize = () => void run('flock',['-n','/state/operation.lock','node','/opt/pulse/src/main.mts','finalize-setup']).catch(() => {});
    setInterval(finalize,60_000).unref(); finalize(); return;
  }
  if (command === 'init') { await initialize(store,keys); return; }
  if (command === 'adopt') { await adopt(store,keys,process.argv.includes('--apply')); return; }
  if (command === 'upgrade-legacy') {
    if (!store.read('installation.json')) { await adopt(store,keys,process.argv.includes('--apply'),true); return; }
    requireThat(store.installation().installed.version === '0.1.1','LEGACY_UPGRADE_NOT_REQUIRED');
    const manifest = importCompatibility(store,keys);
    requireThat(process.argv.includes('--apply'),'LEGACY_UPGRADE_APPLY_REQUIRED');
    store.write('available.json',{manifest,checkedAt:new Date().toISOString(),error:null});
    const result = JSON.parse(await run('flock',['-w','5','/state/submission.lock','node','/opt/pulse/src/main.mts','enqueue'],{input:JSON.stringify({releaseId:manifest.version,idempotencyKey:randomUUID(),localRelease:true,actor:{id:'host-operator',name:'Host operator'}})}));
    requireThat(!result.error,result.error ?? 'UPDATER_UNAVAILABLE'); console.log(`Compatibility update ${result.job.id} started. Wait for success before running update.`); return;
  }
  if (command === 'finalize-setup') { await finalizeSetup(store); return; }
  if (command === 'enqueue') {
    try {
      const input = JSON.parse(readFileSync(0,'utf8'));
      const job = makeJob(store,input);
      if (job.stage === 'queued') await launchWorker(store,job);
      console.log(JSON.stringify({job:publicJob(job),statusToken:job.statusToken}));
    } catch (error) { console.log(JSON.stringify({error:error instanceof UpdateError ? error.code : 'UPDATER_UNAVAILABLE'})); }
    return;
  }
  if (command === 'setup-code') { console.log(readFileSync('/secrets/first-run-code.txt','utf8')); return; }
  if (command === 'export-recovery-key') { requireThat(!existsSync('/export/age-identity.txt'),'EXPORT_ALREADY_EXISTS'); copyFileSync('/secrets/age-identity.txt','/export/age-identity.txt'); console.log('Recovery key exported. Store it separately from this host and its backups.'); return; }
  if (command === 'confirm-escrow') { requireThat(process.argv.includes('--confirmed'),'ESCROW_CONFIRMATION_REQUIRED'); atomicWrite('/secrets/escrow-confirmed',new Date().toISOString()); return; }
  if (command === 'doctor') {
    const ops = new DockerOperations(store,keys);
    let ledger: string[] | null = null;
    try { ledger = await ops.ledger(); } catch { /* State remains inspectable while the database is unavailable. */ }
    const job = store.active();
    console.log(JSON.stringify({version:store.installation().installed.version,ledger,activeJob:job ? publicJob(job) : null,recoveryKey:existsSync('/secrets/age-identity.txt'),escrowConfirmed:existsSync('/secrets/escrow-confirmed')},null,2)); return;
  }
  if (command === 'update') {
    const manifest = importBundle(store,keys); store.write('available.json',{manifest,checkedAt:new Date().toISOString(),error:null});
    const result = JSON.parse(await run('flock',['-w','5','/state/submission.lock','node','/opt/pulse/src/main.mts','enqueue'],{input:JSON.stringify({releaseId:manifest.version,idempotencyKey:randomUUID(),localRelease:true,actor:{id:'host-operator',name:'Host operator'}})}));
    requireThat(!result.error,result.error ?? 'UPDATER_UNAVAILABLE'); console.log(`Update job ${result.job.id} started.`); return;
  }
  if (command === 'worker') {
    const job = store.job(process.argv[3]);
    const ops = new DockerOperations(store,keys);
    if (job.stage === 'queued') await executeUpdate(store,job,ops);
    else await reconcileInterrupted(store,job,ops);
    return;
  }
  if (command === 'recover') {
    const job = store.job(process.argv[3]); requireThat(job.stage === 'recovery-required','RECOVERY_NOT_REQUIRED');
    const install = store.installation(), ops = new DockerOperations(store,keys);
    if (!process.argv.includes('--restore') && !process.argv.includes('--cutover') && !process.argv.includes('--rollback')) { console.log(JSON.stringify({jobId:job.id,backup:job.backup,recovery:job.recovery ?? null,next:!job.migrationStarted ? 'recover JOB --rollback' : job.recovery?.verified ? 'recover JOB --cutover' : 'recover JOB --restore'},null,2)); return; }
    if (process.argv.includes('--rollback')) {
      requireThat(!job.migrationStarted,'RESTORE_REQUIRED_AFTER_MIGRATION');
      await ops.maintenance(job); await ops.rollback(job);
      store.stage(job,'recovered'); ops.publish(job,false); console.log('Prior deployment verified and reopened; no migration was started.'); return;
    }
    if (process.argv.includes('--restore')) {
      await ops.maintenance(job); await ops.decryptBackup(job);
      const recovery = await ops.restore(job,`${install.project}-restore-${randomUUID()}`);
      job.recovery = recovery; store.save(job); console.log('Isolated restore validated. Review doctor and use recover JOB --cutover explicitly.'); return;
    }
    requireThat(job.recovery?.verified,'VERIFIED_RESTORE_REQUIRED');
    await ops.maintenance(job);
    const recovery = job.recovery;
    await compose(store.path(`jobs/${job.id}.${recovery.project}.json`),store.path(`jobs/${job.id}.${recovery.project}.env`),['stop']);
    install.postgresVolume = recovery.postgres; install.minioVolume = recovery.minio; install.installed = job.source;
    // Failed volumes are deliberately retained under their original names.
    ops.install = install; ops.prepare(job.source);
    await compose(ops.file(),ops.env(),['up','-d','--no-build','--wait','--wait-timeout','360','postgres','minio','clamav']);
    await ops.start(job); await ops.verify(job);
    requireThat(await ops.fingerprint() === job.fingerprint,'RECOVERY_FINGERPRINT_MISMATCH');
    atomicWrite(store.path('manager.json'),JSON.stringify(managerCompose(install,job.source.images.updater)));
    await compose(store.path('manager.json'),ops.env(),['up','-d','--no-build','--wait','updater','update-status']);
    store.write('installation.json',install); store.stage(job,'recovered'); ops.publish(job,false); console.log('Recovery accepted; original volumes retained.'); return;
  }
  throw new UpdateError('UNKNOWN_COMMAND');
}
main().catch(error => { console.error(error instanceof UpdateError ? error.code : 'OPERATION_FAILED'); process.exitCode = 1; });

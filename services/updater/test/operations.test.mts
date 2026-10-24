import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Store, atomicWrite } from '../src/store.mts';
import type { Installation, Job } from '../src/store.mts';
import { DockerOperations, writeEnvironment } from '../src/operations.mts';
import { bootstrapEnvironment } from '../src/bootstrap.mts';
import { compose, docker, run, containerId } from '../src/docker.mts';
import { digest } from '../src/release.mts';
import { release } from './fixtures.mts';

test('real PostgreSQL and object backup restores to new volumes and detects historical-data changes',async () => {
  // Fixed disposable namespace; no discovery/adoption of existing deployments.
  const project = 'pulse-updater-data-test';
  const suffix = randomUUID();
  const restore = `${project}-restore-${suffix}`;
  const store = new Store();
  const m = release('0.1.2');
  const metadata = JSON.parse(readFileSync('docs/releases/0.1.2.json','utf8'));
  m.upgrade = {...metadata,rollbackPolicy:'restore-required-after-migration',postgresMajor:16};
  Object.assign(m.images,{postgres:'postgres:16.14-alpine',minio:'minio/minio:RELEASE.2025-04-22T22-12-26Z',minioMc:'minio/mc:RELEASE.2025-04-16T18-13-26Z',minioInit:process.env.PULSE_TEST_MINIO_INIT_IMAGE || 'pulse-updater-minio-test:local',maintenance:'pulse-updater-maintenance-test:local'});
  const template = JSON.parse(execFileSync('docker',['compose','-f','compose.production.yaml','-f','compose.maintenance.yaml','config','--no-interpolate','--no-path-resolution','--format','json'],{encoding:'utf8'}));
  const bytes = Buffer.from(JSON.stringify({schemaVersion:1,compose:template})); m.deployment.sha256 = digest(bytes);
  const install: Installation = {id:suffix,project,mode:'internal',hostname:'localhost',url:'https://localhost:8443',backupSource:'/backups',installed:m,postgresVolume:`${project}-postgres-${suffix}`,minioVolume:`${project}-minio-${suffix}`,caddyDataVolume:`${project}-unused-caddy-data`,caddyConfigVolume:`${project}-unused-caddy-config`,initialized:true};
  store.write('installation.json',install);
  atomicWrite(store.path('releases/0.1.2/deployment.json'),bytes);
  writeEnvironment(store.path('deployment.env'),bootstrapEnvironment(project,'localhost','internal'));
  const ops = new DockerOperations(store,[]);
  const prepare = ops.prepare.bind(ops);
  ops.prepare = (manifest,file=ops.file(),env=ops.env(),restore) => {
    prepare(manifest,file,env,restore);
    // This test-only override allows native development checks on ARM hosts;
    // qualification and all production renderers remain linux/amd64.
    const rendered = JSON.parse(readFileSync(file,'utf8'));
    for (const service of Object.values<any>(rendered.services)) service.platform = process.env.PULSE_TEST_PLATFORM || 'linux/amd64';
    atomicWrite(file,JSON.stringify(rendered));
  };
  const job: Job = {id:randomUUID(),releaseId:'0.2.0',idempotencyKey:'fixture-operation-request',actor:{id:'fixture',name:'Fixture'},stage:'backup',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),migrationStarted:false,source:m,statusToken:'fixture',events:[]};
  const fixture = {project,postgres:install.postgresVolume,minio:install.minioVolume};
  // Restore topology contains only storage and maintenance, with no public ports.
  ops.prepare(m,ops.file(),ops.env(),fixture);
  mkdirSync('/secrets',{recursive:true}); chmodSync('/work',0o700);
  if (!existsSync('/secrets/age-identity.txt')) await run('age-keygen',['-o','/secrets/age-identity.txt']);
  const restoreFile = store.path(`jobs/${job.id}.${restore}.json`), restoreEnv = store.path(`jobs/${job.id}.${restore}.env`);
  try {
    await compose(ops.file(),ops.env(),['up','-d','--wait','--wait-timeout','120','postgres','minio']);
    await compose(ops.file(),ops.env(),['--profile','maintenance','run','--rm','-T','db-roles','npm','run','db:roles:apply','-w','@pulse/api']);
    await compose(ops.file(),ops.env(),['--profile','maintenance','run','--rm','-T','migrate']);
    await compose(ops.file(),ops.env(),['run','--rm','-T','minio-init']);
    const pg = await containerId(ops.file(),ops.env(),'postgres');
    const sql = (statement: string) => docker(['exec','-i',pg,'sh','-c','psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -v ON_ERROR_STOP=1 -f -'],{input:statement});
    // Insert a referenced document alongside a real financial quote, avoiding
    // demo-reset scripts and keeping all credentials ephemeral.
    const object = 'verified update recovery fixture\n';
    await sql(`INSERT INTO pulse."Quote" (id,"quoteNumber",title,total,"calculationMode","legacyMaterialSale","updatedAt") VALUES ('fixture-quote','Q-UPDATE-FIXTURE','Preserved quote',123.45,'LEGACY',123.45,now());
      INSERT INTO pulse."LifecycleDocument" (id,"quoteId","objectKey","originalFileName","mediaType","byteSize",sha256,"updatedAt") VALUES ('fixture-document','fixture-quote','fixture.txt','fixture.txt','text/plain',${Buffer.byteLength(object)},'${digest(object)}',now());`);
    await compose(ops.file(),ops.env(),['--profile','backup','run','--rm','-T','minio-backup','mc alias set pulse http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null; printf "verified update recovery fixture\\n" | mc pipe "pulse/$S3_BUCKET/fixture.txt"']);
    await ops.backup(job);
    assert.ok(job.backup && existsSync(job.backup));
    await ops.decryptBackup(job);
    const restored = await ops.restore(job,restore);
    assert.equal(restored.verified,true);
    assert.notEqual(restored.postgres,install.postgresVolume);
    assert.notEqual(restored.minio,install.minioVolume);
    const evidence = store.read<any>(`jobs/${job.id}.preservation.json`);
    await sql('UPDATE pulse."Quote" SET total=0 WHERE id=\'fixture-quote\';');
    await assert.rejects(ops.preservation(evidence),/HISTORICAL_DATA_CHANGED/);
    // A corrupted encrypted archive must be rejected before restore starts.
    atomicWrite(job.backup!,Buffer.from('tampered archive'));
    await assert.rejects(ops.decryptBackup(job),/BACKUP_CHECKSUM_MISMATCH/);
  } finally {
    // Only these fixed, generated test Compose projects own removable volumes.
    if (existsSync(restoreFile)) await compose(restoreFile,restoreEnv,['down','-v','--remove-orphans']).catch(() => {});
    await compose(ops.file(),ops.env(),['down','-v','--remove-orphans']).catch(() => {});
  }
});

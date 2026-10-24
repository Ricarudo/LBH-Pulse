import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statfsSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { docker, compose, containerId, inspect, run, requireSupportedDocker } from './docker.mts';
import { parseDeployment, renderCompose, managerCompose, imageEnvironment } from './compose.mts';
import { assertUpgrade, digest, requireThat, UpdateError, verifyRelease, download, releaseURL } from './release.mts';
import type { Manifest } from './release.mts';
import { Store, atomicWrite, publicJob } from './store.mts';
import type { Installation, Job } from './store.mts';
import type { Operations } from './engine.mts';

export const expectedLedger = (m: Manifest) => [...m.upgrade.sourceMigrations, ...m.upgrade.targetMigrations];
const protectedTables = ['Client','PointOfContact','ClientSite','Request','RequestUpdate','Quote','QuoteItem','QuoteRevision','Item','ItemPriceHistory','Project','ProjectQuote','ProjectExpense','Invoice','LifecycleDocument','LifecycleContext','LifecycleCollaborator','LifecycleStatusEvent'];
type Preservation = Record<string,{columns:string[];sha256:string}>;
export function readEnvironment(file: string): Record<string,string> {
  const values: Record<string,string> = {};
  for (const line of readFileSync(file,'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    requireThat(match && !/[\r\n\0]/.test(match[2]), 'INVALID_ENVIRONMENT');
    values[match[1]] = match[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return values;
}
export function writeEnvironment(path: string, values: Record<string,string>) {
  // Literal single quoting also prevents Compose from expanding $ in adopted secrets.
  for (const [key,value] of Object.entries(values)) requireThat(/^[A-Z][A-Z0-9_]*$/.test(key) && !/[\r\n\0']/.test(value), 'UNSUPPORTED_ENVIRONMENT_VALUE');
  atomicWrite(path, Object.entries(values).sort().map(([key,value]) => `${key}='${value}'`).join('\n')+'\n');
}
export async function fileHash(path: string) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }
export function walkFiles(root: string, prefix = ''): string[] {
  return readdirSync(join(root,prefix), {withFileTypes:true}).flatMap(entry => {
    requireThat(!entry.isSymbolicLink(), 'BACKUP_SYMLINK_REJECTED');
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walkFiles(root,relative) : [relative];
  });
}
export async function fetchRelease(store: Store, version: string, keys: string[]) {
  const [raw,sig] = await Promise.all([download(releaseURL(version,'release-manifest.json')), download(releaseURL(version,'release-manifest.sig'),64)]);
  const manifest = verifyRelease(raw,sig,keys);
  requireThat(manifest.version === version, 'RELEASE_ID_MISMATCH');
  const bundle = await download(releaseURL(version,'deployment.json'));
  parseDeployment(bundle,manifest);
  atomicWrite(store.path(`releases/${version}/release-manifest.json`),raw);
  atomicWrite(store.path(`releases/${version}/release-manifest.sig`),sig);
  atomicWrite(store.path(`releases/${version}/deployment.json`),bundle);
  return manifest;
}

export class DockerOperations implements Operations {
  store: Store; install: Installation; keys: string[];
  constructor(store: Store, keys: string[]) { this.store = store; this.install = store.installation(); this.keys = keys; }
  release(version: string) { return verifyRelease(readFileSync(this.store.path(`releases/${version}/release-manifest.json`)),readFileSync(this.store.path(`releases/${version}/release-manifest.sig`)),this.keys); }
  env() { return this.store.path('deployment.env'); }
  file() { return this.store.path('runtime.json'); }
  async ledger(file = this.file(), env = this.env()) {
    const rows = await compose(file,env,['exec','-T','postgres','sh','-c', 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --quiet --command=\'SELECT migration_name, (finished_at IS NOT NULL AND rolled_back_at IS NULL)::text FROM pulse."_prisma_migrations" ORDER BY migration_name;\'']);
    return rows.trim().split(/\r?\n/).filter(Boolean).map(row => { const [name,ok] = row.split('|'); requireThat(ok === 'true','INCOMPLETE_MIGRATION'); return name; });
  }
  prepare(m: Manifest, file = this.file(), env = this.env(), restore?: {project: string; postgres: string; minio: string}) {
    const bundle = parseDeployment(readFileSync(this.store.path(`releases/${m.version}/deployment.json`)),m);
    atomicWrite(file,JSON.stringify(renderCompose(bundle,m,this.install,restore)));
    const values = readEnvironment(this.env());
    Object.assign(values,imageEnvironment(m,this.install.mode));
    if (restore) { values.PULSE_POSTGRES_VOLUME = restore.postgres; values.PULSE_MINIO_VOLUME = restore.minio; }
    writeEnvironment(env,values);
  }
  publish(job: Job, maintenance: boolean) {
    atomicWrite('/status/state.json',JSON.stringify({ maintenance, job: publicJob(job), tokenHash: digest(job.statusToken), updatedAt: new Date().toISOString() }),0o644);
  }
  async preflight(job: Job) {
    requireThat(this.install.initialized,'INSTALLATION_NOT_READY');
    const m = job.localRelease ? this.release(job.releaseId) : await fetchRelease(this.store,job.releaseId,this.keys);
    assertUpgrade(this.install.installed.version,m,await this.ledger());
    requireThat(m.upgrade.postgresMajor === this.install.installed.upgrade.postgresMajor,'DATABASE_MAJOR_UPGRADE_REQUIRED');
    await requireSupportedDocker();
    requireThat(existsSync('/secrets/age-identity.txt') && existsSync('/secrets/escrow-confirmed'),'RECOVERY_KEY_ESCROW_REQUIRED');
    await run('age-keygen',['-y','/secrets/age-identity.txt']);
    await this.capacity();
    // The worker stores credentials only in the protected state volume.
    copyFileSync(this.env(),this.store.path(`jobs/${job.id}.source.env`));
    chmodSync(this.store.path(`jobs/${job.id}.source.env`),0o600);
    this.prepare(m,this.store.path(`jobs/${job.id}.target.json`),this.store.path(`jobs/${job.id}.target.env`));
    await compose(this.store.path(`jobs/${job.id}.target.json`),this.store.path(`jobs/${job.id}.target.env`),['config','--quiet']);
  }
  async capacity() {
    const sourceBytes = Number((await compose(this.file(),this.env(),['exec','-T','postgres','sh','-c','psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -tA -c "SELECT pg_database_size(current_database());"'])).trim());
    const objectBytes = Number((await compose(this.file(),this.env(),['exec','-T','minio','sh','-c','du -sk /data | cut -f1'])).trim()) * 1024;
    requireThat(Number.isFinite(sourceBytes) && Number.isFinite(objectBytes), 'CAPACITY_CHECK_FAILED');
    const needed = Math.max(1024**3, (sourceBytes + objectBytes) * 4);
    for (const path of ['/work','/backups','/state']) { const space = statfsSync(path); requireThat(space.bavail * space.bsize > needed,'INSUFFICIENT_DISK_SPACE'); }
  }
  async download(job: Job) {
    const m = this.release(job.releaseId);
    for (const image of new Set(Object.values(m.images))) await docker(['pull','--platform','linux/amd64',image]);
    await this.capacity();
  }
  async maintenance(_job: Job) {
    // The durable gate is already closed. SIGTERM + Compose's grace period drains
    // existing requests; after stop returns there are no application writers.
    await compose(this.file(),this.env(),['stop','--timeout','180','web','api']);
    // A killed Docker CLI can leave its one-off maintenance container running.
    // Recovery must stop these writers before changing the database endpoint.
    for (const service of ['migrate','reference-data','db-roles','baseline','bootstrap-admin','credential-containment']) {
      const ids = (await docker(['ps','--filter',`label=com.docker.compose.project=${this.install.project}`,'--filter',`label=com.docker.compose.service=${service}`,'--format','{{.ID}}'])).trim().split('\n').filter(Boolean);
      if (ids.length) await docker(['stop','--time','180',...ids]);
    }
    for (const name of ['api','web']) requireThat(!(await inspect(await containerId(this.file(),this.env(),name))).State.Running,'WRITERS_STILL_RUNNING');
  }
  async fingerprint(file = this.file(), env = this.env()) {
    const output = await compose(file,env,['--profile','maintenance','run','--rm','--no-deps','-T','data-integrity','npm','run','verify:data-fingerprint','-w','@pulse/api','--','--digest-only']);
    const value = output.trim().split(/\r?\n/).at(-1)!; requireThat(/^[a-f0-9]{64}$/.test(value),'FINGERPRINT_FAILED'); return value;
  }
  async preservation(expected?: Preservation, file = this.file(), env = this.env()) {
    const postgres = await containerId(file,env,'postgres');
    const sql = (query: string) => docker(['exec','-i',postgres,'sh','-c','psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -v ON_ERROR_STOP=1 -tA -f -'],{input:query});
    const result: Preservation = {};
    for (const table of protectedTables) {
      const columns: string[] = expected?.[table]?.columns ?? JSON.parse((await sql(`SELECT COALESCE(json_agg(column_name ORDER BY ordinal_position),'[]'::json) FROM information_schema.columns WHERE table_schema='pulse' AND table_name='${table}';`)).trim());
      if (!columns.length || (expected && !expected[table])) continue;
      requireThat(columns.includes('id') && columns.every(column => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(column)),'PRESERVATION_SCHEMA_UNSUPPORTED');
      // Project the original columns so additive schema changes are allowed.
      // Any change to historical business records requires a separately tested
      // migration procedure rather than silently accepting data loss.
      const query = `SELECT to_jsonb(record) FROM (SELECT ${columns.map(column => `"${column}"`).join(',')} FROM pulse."${table}" ORDER BY id) record;`;
      await docker(['exec','-i',postgres,'sh','-c','psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -v ON_ERROR_STOP=1 -tA -f - -o /tmp/pulse-preservation.jsonl'],{input:query});
      const local = this.store.path('preservation.jsonl');
      await docker(['cp',`${postgres}:/tmp/pulse-preservation.jsonl`,local]);
      try { result[table] = {columns,sha256:await fileHash(local)}; } finally { rmSync(local,{force:true}); await docker(['exec',postgres,'rm','-f','/tmp/pulse-preservation.jsonl']); }
      if (expected) requireThat(result[table].sha256 === expected[table].sha256,'HISTORICAL_DATA_CHANGED');
    }
    return result;
  }
  async backup(job: Job) {
    // This volume is private updater staging, never a business-data volume.
    for (const name of readdirSync('/work')) rmSync(join('/work',name),{recursive:true,force:true});
    mkdirSync('/work/postgres',{recursive:true,mode:0o700}); mkdirSync('/work/config',{mode:0o700});
    job.fingerprint = await this.fingerprint(); this.store.save(job);
    this.store.write(`jobs/${job.id}.preservation.json`,await this.preservation());
    const postgres = await containerId(this.file(),this.env(),'postgres');
    await docker(['exec',postgres,'sh','-c','pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges --file=/tmp/pulse-update.dump']);
    await docker(['cp',`${postgres}:/tmp/pulse-update.dump`,'/work/postgres/pulse.dump']);
    await docker(['exec',postgres,'rm','-f','/tmp/pulse-update.dump']);
    await compose(this.file(),this.env(),['--profile','backup','run','--rm','--no-deps','-T','minio-backup']);
    copyFileSync(this.env(),'/work/config/deployment.env');
    atomicWrite('/work/config/installation.json',JSON.stringify(this.install));
    copyFileSync(this.store.path(`jobs/${job.id}.preservation.json`),'/work/config/preservation.json');
    copyFileSync(this.store.path(`releases/${job.source.version}/deployment.json`),'/work/config/deployment.json');
    for (const name of ['release-manifest.json','release-manifest.sig']) {
      const file = this.store.path(`releases/${job.source.version}/${name}`);
      if (existsSync(file)) copyFileSync(file,`/work/config/${name}`);
    }
    const hashes: Record<string,string> = {};
    for (const file of walkFiles('/work')) hashes[file] = await fileHash(join('/work',file));
    atomicWrite('/work/MANIFEST.json',JSON.stringify(hashes));
    const archive = `/backups/pulse-${job.id}.tar.gz.age`;
    await run('tar',['-czf',`/state/${job.id}.tar.gz`,'-C','/work','.']);
    const recipient = (await run('age-keygen',['-y','/secrets/age-identity.txt'])).trim();
    await run('age',['-r',recipient,'-o',archive,`/state/${job.id}.tar.gz`]);
    rmSync(`/state/${job.id}.tar.gz`);
    requireThat(statSync(archive).size > 0,'EMPTY_BACKUP');
    const sha = await fileHash(archive);
    atomicWrite(`${archive}.sha256`,sha+'\n');
    job.backup = archive; this.store.save(job);
    this.store.write(`jobs/${job.id}.backup.json`,{sha256:sha,archive});
  }
  async decryptBackup(job: Job) {
    const backup = this.store.read<{sha256:string; archive:string}>(`jobs/${job.id}.backup.json`);
    requireThat(backup && backup.archive === `/backups/pulse-${job.id}.tar.gz.age` && await fileHash(backup.archive) === backup.sha256,'BACKUP_CHECKSUM_MISMATCH');
    for (const name of readdirSync('/work')) rmSync(join('/work',name),{recursive:true,force:true});
    await run('age',['-d','-i','/secrets/age-identity.txt','-o',`/state/${job.id}.restore.tar.gz`,backup.archive]);
    await run('tar',['-xzf',`/state/${job.id}.restore.tar.gz`,'-C','/work']);
    rmSync(`/state/${job.id}.restore.tar.gz`);
    const hashes = JSON.parse(readFileSync('/work/MANIFEST.json','utf8')) as Record<string,string>;
    for (const [file,sha] of Object.entries(hashes)) { requireThat(!file.startsWith('/') && !file.split('/').includes('..'),'INVALID_BACKUP_PATH'); requireThat(await fileHash(join('/work',file)) === sha,'BACKUP_CONTENT_MISMATCH'); }
    requireThat(walkFiles('/work').length === Object.keys(hashes).length+1,'BACKUP_CONTENT_MISMATCH');
  }
  async restore(job: Job, project: string) {
    const recovery = {project,postgres:`${project}-postgres`,minio:`${project}-minio`,verified:false};
    for (const volume of [recovery.postgres,recovery.minio]) {
      const existing = (await docker(['volume','ls','--format','{{.Name}}'])).split('\n');
      requireThat(!existing.includes(volume),'RESTORE_VOLUME_ALREADY_EXISTS');
    }
    const file = this.store.path(`jobs/${job.id}.${project}.json`), env = this.store.path(`jobs/${job.id}.${project}.env`);
    this.prepare(job.source,file,env,recovery);
    await compose(file,env,['up','-d','--no-build','--wait','--wait-timeout','360','postgres','minio']);
    await compose(file,env,['--profile','maintenance','run','--rm','-T','db-roles','npm','run','db:roles:apply','-w','@pulse/api']);
    const postgres = await containerId(file,env,'postgres');
    await docker(['cp','/work/postgres/pulse.dump',`${postgres}:/tmp/pulse-restore.dump`]);
    await docker(['exec',postgres,'sh','-c','pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error /tmp/pulse-restore.dump']);
    await docker(['exec',postgres,'rm','-f','/tmp/pulse-restore.dump']);
    await compose(file,env,['--profile','restore','run','--rm','-T','minio-restore']);
    await compose(file,env,['run','--rm','-T','minio-init']);
    await compose(file,env,['--profile','maintenance','run','--rm','-T','db-roles','npm','run','db:roles:apply','-w','@pulse/api']);
    requireThat(JSON.stringify(await this.ledger(file,env)) === JSON.stringify(expectedLedger(job.source)),'RESTORE_LEDGER_MISMATCH');
    await compose(file,env,['--profile','maintenance','run','--rm','-T','db-role-verify']);
    await compose(file,env,['--profile','maintenance','run','--rm','-T','data-integrity','npm','run','verify:data-integrity:deep','-w','@pulse/api']);
    requireThat(await this.fingerprint(file,env) === job.fingerprint,'RESTORE_FINGERPRINT_MISMATCH');
    const preserved = this.store.read<Preservation>(`jobs/${job.id}.preservation.json`);
    requireThat(preserved,'PRESERVATION_EVIDENCE_MISSING'); await this.preservation(preserved,file,env);
    recovery.verified = true;
    return recovery;
  }
  async verifyBackup(job: Job) {
    await this.decryptBackup(job);
    const project = `${this.install.project}-restore-check-${job.id}`;
    job.restoreProject = project; this.store.save(job);
    await this.restore(job,project);
    job.backupVerified = true; this.store.save(job);
    // Keep the verified volumes until acceptance. Stop them without deleting data.
    await compose(this.store.path(`jobs/${job.id}.${project}.json`),this.store.path(`jobs/${job.id}.${project}.env`),['stop']);
  }
  async migrate(job: Job) {
    const m = this.release(job.releaseId);
    assertUpgrade(job.source.version,m,await this.ledger());
    this.prepare(m);
    await compose(this.file(),this.env(),['up','-d','--no-build','--wait','--wait-timeout','360','postgres','minio','clamav']);
    await compose(this.file(),this.env(),['run','--rm','-T','minio-init']);
    await compose(this.file(),this.env(),['--profile','maintenance','run','--rm','-T','migrate']);
    requireThat(JSON.stringify(await this.ledger()) === JSON.stringify(expectedLedger(m)),'TARGET_LEDGER_MISMATCH');
    await compose(this.file(),this.env(),['--profile','maintenance','run','--rm','-T','reference-data']);
    await compose(this.file(),this.env(),['--profile','maintenance','run','--rm','-T','db-role-verify']);
  }
  async start(_job: Job) { await compose(this.file(),this.env(),['up','-d','--no-build','--wait','--wait-timeout','360','api','web','gateway']); }
  async verify(job: Job) {
    await compose(this.file(),this.env(),['--profile','maintenance','run','--rm','-T','data-integrity','npm','run','verify:data-integrity:deep','-w','@pulse/api']);
    await compose(this.file(),this.env(),['exec','-T','api','wget','-q','-O','-','http://127.0.0.1:3000/api/health/ready']);
    await compose(this.file(),this.env(),['exec','-T','web','wget','-q','-O','-','http://127.0.0.1:4300/api/health/live']);
    const preserved = this.store.read<Preservation>(`jobs/${job.id}.preservation.json`);
    if (job.migrationStarted) requireThat(preserved,'PRESERVATION_EVIDENCE_MISSING');
    if (preserved) await this.preservation(preserved);
  }
  async handoff(job: Job) {
    const m = this.release(job.releaseId);
    if (m.images.updater === job.source.images.updater) return;
    atomicWrite(this.store.path('manager.json'),JSON.stringify(managerCompose(this.install,m.images.updater)));
    await compose(this.store.path('manager.json'),this.env(),['up','-d','--no-build','--wait','--wait-timeout','120','updater','update-status']);
  }
  async commit(job: Job) { this.install.installed = this.release(job.releaseId); this.store.write('installation.json',this.install); }
  async rollback(job: Job) {
    requireThat(JSON.stringify(await this.ledger()) === JSON.stringify(expectedLedger(job.source)),'SOURCE_LEDGER_MISMATCH');
    const saved = this.store.path(`jobs/${job.id}.source.env`);
    if (existsSync(saved)) copyFileSync(saved,this.env());
    this.prepare(job.source);
    await this.start(job); await this.verify(job);
  }
}

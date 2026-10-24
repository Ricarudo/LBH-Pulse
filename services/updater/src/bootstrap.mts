import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store, atomicWrite } from './store.mts';
import type { Installation } from './store.mts';
import { requireThat, verifyRelease, parseManifest } from './release.mts';
import type { Manifest } from './release.mts';
import { parseDeployment, renderCompose, managerCompose, imageEnvironment } from './compose.mts';
import { compose, docker, inspect, run, containerId, requireSupportedDocker } from './docker.mts';
import { DockerOperations, expectedLedger, readEnvironment, writeEnvironment } from './operations.mts';

export const managedRouting = `route {
  handle /_pulse/* {
    reverse_proxy pulse-update-status:9051
  }
  forward_auth pulse-update-status:9051 {
    uri /gate
  }
}
`;
const secret = () => randomBytes(48).toString('hex');
export function bootstrapEnvironment(project: string, hostname: string, mode: Installation['mode']) {
  requireThat(/^[a-z][a-z0-9-]{2,40}$/.test(project),'INVALID_PROJECT_NAME');
  requireThat(/^(?:localhost|[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?)$/.test(hostname),'INVALID_HOSTNAME');
  requireThat(['internal','lan','public'].includes(mode),'INVALID_MODE');
  requireThat(mode !== 'public' || hostname !== 'localhost','PUBLIC_HOSTNAME_REQUIRED');
  const url = `https://${hostname}${mode === 'internal' ? ':8443' : ''}`;
  const admin = secret(), migrator = secret(), app = secret();
  return {
    NODE_ENV:'production',PULSE_PUBLIC_URL:url,PULSE_HOSTNAME:hostname,PULSE_CADDY_TARGET:mode === 'public' ? 'public' : 'internal', PULSE_CADDY_EMAIL:process.env.PULSE_CADDY_EMAIL ?? 'operator@example.invalid',
    PULSE_HTTP_PORT:mode === 'internal' ? '127.0.0.1:8080' : '80', PULSE_HTTPS_PORT:mode === 'internal' ? '127.0.0.1:8443' : '443',
    POSTGRES_DB:'pulse',POSTGRES_ADMIN_USER:'pulse_admin',POSTGRES_ADMIN_PASSWORD:admin,
    PULSE_DB_MIGRATION_USER:'pulse_migrator',PULSE_DB_MIGRATION_PASSWORD:migrator,PULSE_DB_APP_USER:'pulse_app',PULSE_DB_APP_PASSWORD:app,
    PULSE_DATABASE_ADMIN_URL:`postgresql://pulse_admin:${admin}@postgres:5432/pulse?schema=pulse`,PULSE_DATABASE_MIGRATION_URL:`postgresql://pulse_migrator:${migrator}@postgres:5432/pulse?schema=pulse`,DATABASE_URL:`postgresql://pulse_app:${app}@postgres:5432/pulse?schema=pulse`,
    PULSE_POSTGRES_VOLUME:`${project}-postgres`,PULSE_MINIO_VOLUME:`${project}-minio`,MINIO_ROOT_USER:'pulse_root',MINIO_ROOT_PASSWORD:secret(),S3_ACCESS_KEY:'pulse_app',S3_SECRET_KEY:secret(),S3_BUCKET:'pulse-documents',S3_ENDPOINT:'http://minio:9000',S3_REGION:'us-east-1',S3_FORCE_PATH_STYLE:'true',
    PULSE_SESSION_SECRET:secret(),PULSE_SECURITY_PEPPER:secret(),PULSE_SETUP_TOKEN:secret(),PULSE_COOKIE_SECURE:'true',PULSE_COOKIE_SAME_SITE:'strict',PULSE_TRUST_PROXY_HOPS:'2',PULSE_ALLOWED_ORIGINS:url,
    PULSE_AUTH_RATE_LIMIT_ENABLED:'true',PULSE_REQUIRE_CREDENTIAL_CONTAINMENT:'true',PULSE_MAINTENANCE_ACTOR_EMAIL:'pulse-updater@localhost.invalid',PULSE_BACKUP_CONTAINER_USER:'0:0',CLAMAV_PLATFORM:'linux/amd64',
    PULSE_BOOTSTRAP_ADMIN_NAME:'disabled',PULSE_BOOTSTRAP_ADMIN_EMAIL:'disabled@localhost.invalid',PULSE_BOOTSTRAP_ADMIN_PASSWORD_FILE:'/disabled',PULSE_CREDENTIAL_CONTAINMENT_FILE:'/disabled',PULSE_BACKUP_WORK_DIR:'/work',PULSE_RESTORE_WORK_DIR:'/work'
  };
}
export function importBundle(store: Store, keys: string[], directory = '/bundle') {
  const raw = readFileSync(`${directory}/release-manifest.json`), sig = readFileSync(`${directory}/release-manifest.sig`);
  const manifest = verifyRelease(raw,sig,keys);
  const bundle = readFileSync(`${directory}/deployment.json`); parseDeployment(bundle,manifest);
  for (const file of ['release-manifest.json','release-manifest.sig','deployment.json']) atomicWrite(store.path(`releases/${manifest.version}/${file}`),readFileSync(`${directory}/${file}`));
  return manifest;
}
export function importCompatibility(store: Store, keys: string[]) {
  const raw = readFileSync('/bundle/compatibility-0.1.2.json');
  const sig = readFileSync('/bundle/compatibility-0.1.2.sig');
  const manifest = verifyRelease(raw,sig,keys);
  requireThat(manifest.version === '0.1.2','INVALID_COMPATIBILITY_RELEASE');
  const bundle = readFileSync('/bundle/deployment.json'); parseDeployment(bundle,manifest);
  atomicWrite(store.path('releases/0.1.2/release-manifest.json'),raw);
  atomicWrite(store.path('releases/0.1.2/release-manifest.sig'),sig);
  atomicWrite(store.path('releases/0.1.2/deployment.json'),bundle);
  return manifest;
}
async function backupSource() {
  const self = await inspect(process.env.HOSTNAME ?? '');
  const mount = self.Mounts.find((m: any) => m.Destination === '/backups');
  requireThat(mount?.Type === 'bind' && mount.RW,'BACKUP_HOST_DIRECTORY_REQUIRED');
  return mount.Source as string;
}
async function createVolumes(install: Installation, fresh: boolean, resume = false) {
  const existing = (await docker(['volume','ls','--format','{{.Name}}'])).split('\n');
  for (const volume of [install.postgresVolume,install.minioVolume,install.caddyDataVolume,install.caddyConfigVolume]) {
    if (fresh) requireThat(!existing.includes(volume),'UNMANAGED_VOLUME_EXISTS');
    else if (!resume) requireThat(existing.includes(volume),'SOURCE_VOLUME_MISSING');
    if (resume && existing.includes(volume)) {
      const info = JSON.parse(await docker(['volume','inspect',volume]))[0];
      requireThat(info.Labels?.['io.pulse.installation'] === install.id,'UNMANAGED_VOLUME_EXISTS');
    }
    if (!existing.includes(volume)) await docker(['volume','create','--label',`io.pulse.installation=${install.id}`,volume]);
  }
  for (const suffix of ['state','status','auth','secrets','work']) await docker(['volume','create',`${install.project}-update-${suffix}`]);
  await docker(['volume','create',`${install.project}-disabled-input`]);
  const networks = (await docker(['network','ls','--format','{{.Name}}'])).split('\n');
  if (!networks.includes(`${install.project}-control`)) await docker(['network','create','--internal',`${install.project}-control`]);
  if (!networks.includes(`${install.project}_frontend`)) await docker(['network','create','--internal','--label',`com.docker.compose.project=${install.project}`,'--label','com.docker.compose.network=frontend',`${install.project}_frontend`]);
}
function writeManagement(store: Store, install: Installation) {
  for (const dir of ['/status','/auth','/secrets','/work']) mkdirSync(dir,{recursive:true});
  chmodSync('/status',0o755); chmodSync('/auth',0o755); chmodSync('/secrets',0o700); chmodSync('/work',0o700);
  mkdirSync(store.path('jobs'),{recursive:true,mode:0o700});
  if (!existsSync('/auth/token')) atomicWrite('/auth/token',secret(),0o444);
  atomicWrite('/status/managed.caddy',managedRouting,0o644);
  atomicWrite('/status/state.json',JSON.stringify({maintenance:true}),0o644);
  atomicWrite(store.path('manager.json'),JSON.stringify(managerCompose(install,install.installed.images.updater)));
}
async function startManager(store: Store) { await compose(store.path('manager.json'),store.path('deployment.env'),['up','-d','--no-build','--wait','--wait-timeout','120','updater','update-status']); }
async function exportCertificate(store: Store, install: Installation) {
  if (install.mode === 'public') return;
  const gateway = await containerId(store.path('runtime.json'),store.path('deployment.env'),'gateway');
  await docker(['cp',`${gateway}:/data/caddy/pki/authorities/local/root.crt`,'/backups/pulse-root-ca.crt']);
}
export async function initialize(store: Store, keys: string[]) {
  await requireSupportedDocker();
  requireThat(!store.read<Installation>('installation.json')?.initialized || store.read('initializing.json'),'ALREADY_INITIALIZED');
  const manifest = importBundle(store,keys);
  let install = store.read<Installation>('initializing.json');
  if (!install) {
    const project = process.env.PULSE_PROJECT ?? 'pulse-production';
    const mode = (process.env.PULSE_MODE ?? 'internal') as Installation['mode'];
    const hostname = process.env.PULSE_HOSTNAME ?? 'localhost';
    const env = bootstrapEnvironment(project,hostname,mode);
    install = {id:randomUUID(),project,mode,hostname,url:env.PULSE_PUBLIC_URL,backupSource:await backupSource(),installed:manifest,postgresVolume:env.PULSE_POSTGRES_VOLUME,minioVolume:env.PULSE_MINIO_VOLUME,caddyDataVolume:`${project}_caddy-data`,caddyConfigVolume:`${project}_caddy-config`,initialized:false};
    // Check first; a retry may only adopt volumes recorded by this initialization.
    const existing = (await docker(['volume','ls','--format','{{.Name}}'])).split('\n');
    requireThat(!existing.includes(install.postgresVolume) && !existing.includes(install.minioVolume),'UNMANAGED_VOLUME_EXISTS');
    writeEnvironment(store.path('deployment.env'),{...env,...imageEnvironment(manifest,mode)});
    store.write('initializing.json',install);
    await createVolumes(install,true);
  } else { requireThat(install.installed.version === manifest.version && install.installed.commit === manifest.commit && JSON.stringify(install.installed.images) === JSON.stringify(manifest.images),'INITIALIZATION_RELEASE_MISMATCH'); await createVolumes(install,false,true); }
  writeManagement(store,install);
  if (!existsSync('/secrets/age-identity.txt')) await run('age-keygen',['-o','/secrets/age-identity.txt']);
  const bundle = parseDeployment(readFileSync(store.path(`releases/${manifest.version}/deployment.json`)),manifest);
  atomicWrite(store.path('runtime.json'),JSON.stringify(renderCompose(bundle,manifest,install)));
  const file = store.path('runtime.json'),env = store.path('deployment.env');
  for (const image of new Set(Object.values(manifest.images))) await docker(['pull','--platform','linux/amd64',image]);
  await compose(file,env,['stop','--timeout','180','api','web']);
  await compose(file,env,['up','-d','--no-build','--wait','--wait-timeout','360','postgres','minio','clamav']);
  await compose(file,env,['--profile','maintenance','run','--rm','-T','db-roles','npm','run','db:roles:apply','-w','@pulse/api']);
  await compose(file,env,['run','--rm','-T','minio-init']);
  await compose(file,env,['--profile','maintenance','run','--rm','-T','migrate']);
  await compose(file,env,['--profile','maintenance','run','--rm','-T','reference-data']);
  await compose(file,env,['--profile','maintenance','run','--rm','-T','db-role-verify']);
  await compose(store.path('manager.json'),env,['up','-d','--no-build','--wait','--wait-timeout','120','update-status']);
  await compose(file,env,['up','-d','--no-build','--wait','--wait-timeout','360','api','web','gateway']);
  await exportCertificate(store,install);
  atomicWrite('/secrets/first-run-code.txt',readEnvironment(env).PULSE_SETUP_TOKEN);
  install.initialized = true; store.write('installation.json',install);
  await startManager(store);
  atomicWrite('/status/state.json',JSON.stringify({maintenance:false}),0o644);
  rmSync(store.path('initializing.json'));
  console.log(`Pulse is ready for browser setup at ${install.url}. Retrieve the setup code with the setup-code command. Export and escrow the recovery key before enabling updates.`);
}
export async function finalizeSetup(store: Store) {
  const env = readEnvironment(store.path('deployment.env'));
  if (!env.PULSE_SETUP_TOKEN || (store.active() && !['succeeded','failed','recovered'].includes(store.active()!.stage))) return;
  const postgres = await containerId(store.path('runtime.json'),store.path('deployment.env'),'postgres');
  const result = await docker(['exec','-i',postgres,'sh','-c','psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -v ON_ERROR_STOP=1 -tA -f -'],{input:`SELECT count(*) FROM pulse."MaintenanceRun" WHERE kind = 'INTERACTIVE_ADMIN_SETUP' AND "completedAt" IS NOT NULL;`});
  if (Number(result.trim()) < 1) return;
  delete env.PULSE_SETUP_TOKEN; writeEnvironment(store.path('deployment.env'),env);
  rmSync('/secrets/first-run-code.txt',{force:true});
  await compose(store.path('runtime.json'),store.path('deployment.env'),['up','-d','--no-build','--no-deps','--wait','api']);
}

export async function adopt(store: Store, keys: string[], apply: boolean, legacyUpgrade = false) {
  await requireSupportedDocker();
  requireThat((process.env.PULSE_PROJECT ?? 'pulse-production') === 'pulse-production','ADOPTION_PROJECT_MISMATCH');
  requireThat(!store.read<Installation>('installation.json') || store.read('adopting.json'),'ALREADY_INITIALIZED');
  const target = importBundle(store,keys);
  const legacy = JSON.parse(readFileSync('/legacy/installer/state.json','utf8'));
  requireThat(legacy.installationStatus === 'installed' && legacy.version === (legacyUpgrade ? '0.1.1' : '0.1.2'),'ADOPTION_REQUIRES_COMPLETED_SUPPORTED_INSTALLATION');
  const legacyManifest = JSON.parse(readFileSync('/legacy/deployment/release-manifest.json','utf8'));
  requireThat(legacyManifest.version === legacy.version && legacyManifest.commit === legacy.commit && Object.keys(legacyManifest.images).every(key => legacyManifest.images[key] === legacy.images[key]),'LEGACY_STATE_MISMATCH');
  const env = readEnvironment('/legacy/config/.env.production');
  const project = 'pulse-production';
  const running = JSON.parse(await docker(['ps','-a','--filter',`label=com.docker.compose.project=${project}`,'--format','json']).then(lines => '['+lines.trim().split('\n').filter(Boolean).join(',')+']'));
  requireThat(running.length >= 6 && env.NODE_ENV === 'production','UNMANAGED_INSTALLATION');
  const source = parseManifest(JSON.stringify({...target,version:legacy.version,tag:`v${legacy.version}`,commit:legacy.commit,images:{...legacy.images,updater:target.images.updater,gatewayInternal:target.images.gatewayInternal,gatewayPublic:target.images.gatewayPublic},upgrade:{...legacyManifest.upgrade,postgresMajor:16}}));
  // Adoption is an explicit operator trust boundary for the old unsigned installer.
  // Source images are checked against running digest-pinned containers, then the
  // signed current deployment template is used for management integration only.
  for (const name of ['api','web','postgres','minio','clamav']) {
    const id = (await docker(['ps','-a','--filter',`label=com.docker.compose.project=${project}`,'--filter',`label=com.docker.compose.service=${name}`,'--format','{{.ID}}'])).trim();
    const container = await inspect(id);
    requireThat(container.Config.Image === legacy.images[name] && /@sha256:[a-f0-9]{64}$/.test(container.Config.Image),'LEGACY_IMAGE_MISMATCH');
    if (name === 'postgres' || name === 'minio') requireThat(container.Mounts.some((m: any) => m.Type === 'volume' && m.Name === env[name === 'postgres' ? 'PULSE_POSTGRES_VOLUME' : 'PULSE_MINIO_VOLUME']),'LEGACY_VOLUME_MISMATCH');
  }
  const postgres = (await docker(['ps','-a','--filter',`label=com.docker.compose.project=${project}`,'--filter','label=com.docker.compose.service=postgres','--format','{{.ID}}'])).trim();
  const rows = await docker(['exec',postgres,'sh','-c', 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -tA -c \'SELECT migration_name, (finished_at IS NOT NULL AND rolled_back_at IS NULL)::text FROM pulse."_prisma_migrations" ORDER BY migration_name;\'']);
  requireThat(rows.trim().split(/\r?\n/).join() === expectedLedger(source).map(name => `${name}|true`).join(),'SOURCE_LEDGER_MISMATCH');
  const users = await docker(['exec',postgres,'sh','-c', 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -tA -c \'SELECT count(*) FROM pulse."LocalUser";\'']);
  requireThat(Number(users.trim()) > 0,'FIRST_RUN_NOT_COMPLETED');
  const install: Installation = {id:store.read<Installation>('adopting.json')?.id ?? randomUUID(),project,mode:legacy.mode,hostname:env.PULSE_HOSTNAME,url:env.PULSE_PUBLIC_URL,backupSource:await backupSource(),installed:source,postgresVolume:env.PULSE_POSTGRES_VOLUME,minioVolume:env.PULSE_MINIO_VOLUME,caddyDataVolume:`${project}_caddy-data`,caddyConfigVolume:`${project}_caddy-config`,initialized:true,adopted:true};
  requireThat(existsSync('/legacy/config/recovery/age-identity.txt'),'RECOVERY_KEY_MISSING');
  const normalizedPath = (value: string) => value.replace(/\\/g,'/').replace(/\/$/,'').toLowerCase();
  requireThat(normalizedPath(process.env.PULSE_BACKUP_PATH ?? '') === normalizedPath(env.PULSE_BACKUP_DIR ?? ''),'ORIGINAL_BACKUP_PATH_REQUIRED');
  // Validate serialization without modifying the legacy configuration.
  writeEnvironment(store.path('adoption-preview.env'),{...env,...imageEnvironment(source,install.mode)});
  console.log(JSON.stringify({version:source.version,project,url:install.url,postgresVolume:install.postgresVolume,minioVolume:install.minioVolume,apply},null,2));
  if (!apply) return;
  store.write('adopting.json',install);
  await createVolumes(install,false);
  atomicWrite(store.path(`releases/${source.version}/deployment.json`),readFileSync(store.path(`releases/${target.version}/deployment.json`)));
  source.deployment = target.deployment;
  writeEnvironment(store.path('deployment.env'),{...env,...imageEnvironment(source,install.mode)});
  store.write('installation.json',install); writeManagement(store,install);
  copyFileSync('/legacy/config/recovery/age-identity.txt','/secrets/age-identity.txt'); chmodSync('/secrets/age-identity.txt',0o600);
  const ops = new DockerOperations(store,keys); ops.prepare(source);
  requireThat(JSON.stringify(await ops.ledger()) === JSON.stringify(expectedLedger(source)),'SOURCE_LEDGER_MISMATCH');
  // No database migration occurs during adoption. The first 0.2 update is CLI
  // initiated because the old application has no update screen.
  await startManager(store);
  await compose(ops.file(),ops.env(),['up','-d','--no-build','--wait','--wait-timeout','360','api','web','gateway']);
  atomicWrite('/status/state.json',JSON.stringify({maintenance:false}),0o644);
  rmSync(store.path('adopting.json'));
  console.log('Adoption complete. Escrow the recovery key, then run update to install the bundled release.');
}

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, sign, verify, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = new Map();
for (let i=2;i<process.argv.length;i+=2) args.set(process.argv[i],process.argv[i+1]);
const output = resolve(args.get('--output') || 'release-bundle');
const manifest = JSON.parse(readFileSync(resolve(output,'release-manifest.json'),'utf8'));
if (!manifest.images.updater?.match(/^ghcr\.io\/ricarudo\/pulse-updater@sha256:[a-f0-9]{64}$/)) throw new Error('A digest-pinned updater image is required.');
const trustStore = args.get('--trust-store') || 'services/updater/trusted-keys.json';
const keys = JSON.parse(readFileSync(trustStore,'utf8'));
const privateKey = createPrivateKey(process.env.PULSE_RELEASE_SIGNING_KEY || '');
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The release signing key must be Ed25519.');
const probe = Buffer.from('pulse-release-key-validation');
if (!keys.some(key => verify(null,probe,createPublicKey(key),sign(null,probe,privateKey)))) throw new Error('The signing key is not embedded in the updater trust store.');

const compose = JSON.parse(execFileSync('docker',['compose','-f','compose.production.yaml','-f','compose.maintenance.yaml','config','--no-interpolate','--no-path-resolution','--format','json'],{encoding:'utf8'}));
const bundle = Buffer.from(JSON.stringify({schemaVersion:1,compose},null,2)+'\n');
writeFileSync(resolve(output,'deployment.json'),bundle);
manifest.schemaVersion = 3;
manifest.minimumUpdaterProtocol = 1;
manifest.releaseNotes = readFileSync(`docs/releases/${manifest.version}.md`,'utf8');
manifest.deployment = {asset:'deployment.json',sha256:createHash('sha256').update(bundle).digest('hex')};
manifest.upgrade.postgresMajor = 16;
const bytes = Buffer.from(JSON.stringify(manifest,null,2)+'\n');
writeFileSync(resolve(output,'release-manifest.json'),bytes);
writeFileSync(resolve(output,'release-manifest.sig'),sign(null,bytes,privateKey));
// Re-sign an explicit compatibility release so 0.1.1 operators need no new EXE.
// The old API/maintenance images are resolved from the publisher's immutable tag;
// management/gateway use this signed release's managed topology.
if (manifest.version !== '0.1.2') {
  const legacyMetadata = JSON.parse(readFileSync('docs/releases/0.1.2.json','utf8'));
  const legacyImages = {...manifest.images};
  const names = {api:'pulse-api',web:'pulse-web',maintenance:'pulse-maintenance',minioInit:'pulse-minio-init',clamav:'pulse-clamav',backupCrypto:'pulse-backup-crypto'};
  let legacyCommit;
  for (const [component,image] of Object.entries(names)) {
    const ref = `ghcr.io/ricarudo/${image}:0.1.2`;
    execFileSync('docker',['pull','--platform','linux/amd64',ref],{stdio:'ignore'});
    const info = JSON.parse(execFileSync('docker',['image','inspect',ref],{encoding:'utf8'}))[0];
    if (!info.RepoDigests?.[0]?.match(/@sha256:[a-f0-9]{64}$/)) throw new Error('Compatibility digest missing.');
    legacyImages[component] = info.RepoDigests[0];
    if (component === 'api') legacyCommit = info.Config.Labels['org.opencontainers.image.revision'];
  }
  const legacy = {...manifest,version:'0.1.2',tag:'v0.1.2',commit:legacyCommit,images:legacyImages,releaseNotes:'Compatibility upgrade from Pulse 0.1.1 to 0.1.2 before managed 0.2 installation.',upgrade:{minimumVersion:legacyMetadata.minimumVersion,sourceMigrations:legacyMetadata.sourceMigrations,targetMigrations:legacyMetadata.targetMigrations,rollbackPolicy:'restore-required-after-migration',postgresMajor:16}};
  const raw = Buffer.from(JSON.stringify(legacy,null,2)+'\n');
  writeFileSync(resolve(output,'compatibility-0.1.2.json'),raw);
  writeFileSync(resolve(output,'compatibility-0.1.2.sig'),sign(null,raw,privateKey));
}
copyFileSync(trustStore,resolve(output,'trusted-keys.json'));
copyFileSync('docs/production/docker-installation.md',resolve(output,'README.md'));

const project = '${PULSE_PROJECT:-pulse-production}';
const bootstrap = {
  name:`${project}-bootstrap`,
  services:{ updater:{ image:manifest.images.updater,platform:'linux/amd64',init:true,read_only:true,tmpfs:['/tmp'],cap_drop:['ALL'],security_opt:['no-new-privileges:true'],command:['doctor'],environment:{PULSE_PROJECT:project,PULSE_MODE:'${PULSE_MODE:-internal}',PULSE_HOSTNAME:'${PULSE_HOSTNAME:-localhost}',PULSE_BACKUP_PATH:'${PULSE_BACKUP_PATH}',PULSE_CADDY_EMAIL:'${PULSE_CADDY_EMAIL:-operator@example.invalid}'},volumes:[
    {type:'bind',source:'/var/run/docker.sock',target:'/var/run/docker.sock'},
    {type:'bind',source:'.',target:'/bundle',read_only:true},
    {type:'bind',source:'${PULSE_BACKUP_PATH:?Set an absolute existing backup directory}',target:'/backups',bind:{create_host_path:false}},
    ...['state','status','auth','secrets','work'].map(n => ({type:'volume',source:n,target:`/${n}`}))
  ]}},volumes:Object.fromEntries(['state','status','auth','secrets','work'].map(n => [n,{name:`${project}-update-${n}`}]))
};
writeFileSync(resolve(output,'compose.yaml'),JSON.stringify(bootstrap,null,2)+'\n');
writeFileSync(resolve(output,'.env.example'),'PULSE_PROJECT=pulse-production\nPULSE_MODE=internal\nPULSE_HOSTNAME=localhost\nPULSE_BACKUP_PATH=/absolute/existing/backup/directory\n');
console.log(`Created signed Docker deployment bundle for Pulse ${manifest.version}.`);

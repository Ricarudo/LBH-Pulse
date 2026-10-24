import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease, assertUpgrade, compareVersions, digest, parseManifest, releaseURL } from '../src/release.mts';
import { parseDeployment, renderCompose } from '../src/compose.mts';
import { bootstrapEnvironment } from '../src/bootstrap.mts';
import { Store } from '../src/store.mts';
import { readEnvironment, writeEnvironment } from '../src/operations.mts';
import { makeJob } from '../src/server.mts';
import { release, signed } from './fixtures.mts';

test('accepts valid Ed25519 signature and overlapping trusted keys',() => {
  const {raw,sig,key} = signed(); const other = generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'}).toString();
  assert.equal(verifyRelease(raw,sig,[other,key]).version,'0.2.0');
});
test('rejects tampering, unsigned data and untrusted keys',() => {
  const {raw,sig,key} = signed(); assert.throws(() => verifyRelease(Buffer.concat([raw,Buffer.from(' ')]),sig,[key]),/UNTRUSTED_SIGNATURE/);
  assert.throws(() => verifyRelease(raw,Buffer.alloc(64),[key]),/UNTRUSTED_SIGNATURE/);
  assert.throws(() => verifyRelease(raw,sig,[]),/UNTRUSTED_SIGNATURE/);
});
for (const [name,mutate] of [
  ['untrusted image',(m: any) => m.images.api = `attacker/api@sha256:${'a'.repeat(64)}`],
  ['moving tag',(m: any) => m.images.api = 'ghcr.io/ricarudo/pulse-api:latest'],
  ['unsupported architecture',(m: any) => m.platform = 'linux/arm64'],
  ['new updater protocol',(m: any) => m.minimumUpdaterProtocol = 99],
  ['duplicate migrations',(m: any) => m.upgrade.targetMigrations = m.upgrade.sourceMigrations],
  ['postgres major upgrade',(m: any) => m.upgrade.postgresMajor = 17]
] as const) test(`rejects ${name}`,() => { const m = release(); mutate(m); assert.throws(() => parseManifest(JSON.stringify(m))); });
test('enforces exact source migration ledger and forward version order',() => {
  const m = release(); assertUpgrade('0.1.2',m,m.upgrade.sourceMigrations);
  assert.throws(() => assertUpgrade('0.1.1',m,m.upgrade.sourceMigrations),/INTERMEDIATE/);
  assert.throws(() => assertUpgrade('0.2.0',m,m.upgrade.sourceMigrations),/DOWNGRADE/);
  assert.throws(() => assertUpgrade('0.1.2',m,[]),/LEDGER/);
  assert.equal(compareVersions('0.10.0','0.2.0'),1);
});
test('bundle hash covers deployment definitions and rejects Docker socket access',() => {
  const bytes = Buffer.from(JSON.stringify({schemaVersion:1,compose:{services:{api:{},web:{}},volumes:{},networks:{}}}));
  const m = release(); m.deployment.sha256 = digest(bytes); assert.ok(parseDeployment(bytes,m));
  assert.throws(() => parseDeployment(Buffer.from('{}'),m),/HASH/);
  const bad = Buffer.from(JSON.stringify({schemaVersion:1,compose:{services:{api:{volumes:[{source:'/var/run/docker.sock'}]},web:{}}}})); m.deployment.sha256 = digest(bad);
  assert.throws(() => parseDeployment(bad,m),/UNSAFE/);
});
test('release URLs cannot contain arbitrary paths or hosts',() => {
  assert.match(releaseURL('0.2.0','deployment.json'),/^https:\/\/github.com\/Ricarudo\/LBH-Pulse/);
  assert.throws(() => releaseURL('../foo','deployment.json')); assert.throws(() => releaseURL('0.2.0','https://example.com'));
});
test('bootstrap creates distinct random credentials and binds local mode to loopback',() => {
  const e = bootstrapEnvironment('pulse-production','localhost','internal');
  assert.equal(e.PULSE_HTTPS_PORT,'127.0.0.1:8443'); assert.equal(e.PULSE_PUBLIC_URL,'https://localhost:8443');
  assert.notEqual(e.POSTGRES_ADMIN_PASSWORD,e.PULSE_DB_APP_PASSWORD);
  assert.notEqual(e.PULSE_SECURITY_PEPPER,e.PULSE_SESSION_SECRET);
  assert.notEqual(e.PULSE_SETUP_TOKEN,bootstrapEnvironment('pulse-production','localhost','internal').PULSE_SETUP_TOKEN);
  assert.throws(() => bootstrapEnvironment('x;id','localhost','internal'));
  assert.throws(() => bootstrapEnvironment('pulse-production','localhost\nadmin off','public'));
});
test('environment serialization preserves literal dollar signs without shell interpolation',() => {
  const root = mkdtempSync(join(tmpdir(),'pulse-env-')); try {
    const file = join(root,'env'); writeEnvironment(file,{SECRET:'hello$HOME${VALUE}world'}); assert.equal(readEnvironment(file).SECRET,'hello$HOME${VALUE}world');
    assert.throws(() => writeEnvironment(file,{SECRET:'line\nnext'}));
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('duplicate clicks return one durable job; conflicts cannot replace an active update',() => {
  const root = mkdtempSync(join(tmpdir(),'pulse-jobs-')); try {
    const store = new Store(root); store.write('installation.json',{initialized:true,installed:{version:'0.1.2'}}); store.write('available.json',{manifest:release()});
    const input = {releaseId:'0.2.0',idempotencyKey:'abcdefghijklmnop',actor:{id:'admin',name:'Administrator'}};
    const first = makeJob(store,input); assert.equal(makeJob(store,input).id,first.id);
    assert.equal(makeJob(store,{...input,idempotencyKey:'different-key-123456'}).id,first.id);
    assert.throws(() => makeJob(store,{...input,releaseId:'0.3.0'}),/CONFLICT/);
    store.stage(first,'recovery-required'); assert.throws(() => makeJob(store,{...input,idempotencyKey:'different-key-123456'}),/ACTIVE/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

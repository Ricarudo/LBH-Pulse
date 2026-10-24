import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { release } from './fixtures.mts';
import { importBundle } from '../src/bootstrap.mts';
import { Store } from '../src/store.mts';

test('publisher creates a verifiable standalone Docker bundle and rejects an unrelated signing key',() => {
  const dir = mkdtempSync(join(tmpdir(),'pulse-publishing-'));
  try {
    const pair = generateKeyPairSync('ed25519');
    const publicKey = pair.publicKey.export({type:'spki',format:'pem'}).toString();
    const env = {...process.env,PULSE_RELEASE_SIGNING_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()};
    const keys = join(dir,'keys.json'); writeFileSync(keys,JSON.stringify([publicKey]));
    const output = join(dir,'bundle'); mkdirSync(output);
    const m = release('0.1.2'); m.images.updater = `ghcr.io/ricarudo/pulse-updater@sha256:${'b'.repeat(64)}`;
    m.upgrade = {...JSON.parse(readFileSync('docs/releases/0.1.2.json','utf8')),rollbackPolicy:'restore-required-after-migration',postgresMajor:16};
    writeFileSync(join(output,'release-manifest.json'),JSON.stringify(m));
    const args = ['scripts/release/create-deployment-bundle.mjs','--output',output,'--trust-store',keys];
    execFileSync(process.execPath,args,{env,stdio:'pipe'});
    const verified = importBundle(new Store(join(dir,'state')),[publicKey],output);
    assert.equal(verified.version,'0.1.2');
    assert.ok(readFileSync(join(output,'README.md'),'utf8').includes('Docker Desktop'));
    assert.ok(readFileSync(join(output,'.env.example'),'utf8').includes('PULSE_BACKUP_PATH'));
    const compose = JSON.parse(readFileSync(join(output,'compose.yaml'),'utf8'));
    assert.equal(compose.services.updater.image,m.images.updater);
    assert.equal(compose.services.updater.volumes.filter((v:any) => v.target === '/backups')[0].bind.create_host_path,false);
    const key = generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString();
    assert.notEqual(spawnSync(process.execPath,args,{env:{...env,PULSE_RELEASE_SIGNING_KEY:key},stdio:'pipe'}).status,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

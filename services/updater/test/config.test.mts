import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderCompose, managerCompose, parseDeployment } from '../src/compose.mts';
import { bootstrapEnvironment } from '../src/bootstrap.mts';
import { writeEnvironment } from '../src/operations.mts';
import type { Installation } from '../src/store.mts';
import { digest } from '../src/release.mts';
import { release } from './fixtures.mts';

test('real production templates render into isolated runtime, manager and restore projects',() => {
  const template = JSON.parse(execFileSync('docker',['compose','-f','compose.production.yaml','-f','compose.maintenance.yaml','config','--no-interpolate','--no-path-resolution','--format','json'],{encoding:'utf8'}));
  const bundle = {schemaVersion:1 as const,compose:template};
  const bytes = Buffer.from(JSON.stringify(bundle)); const m = release(); m.deployment.sha256 = digest(bytes);
  parseDeployment(bytes,m);
  const dir = mkdtempSync(join(tmpdir(),'pulse-config-'));
  try {
    for (const mode of ['internal','lan','public'] as const) {
      const install: Installation = {id:'fixture',project:'pulse-config-fixture',mode,hostname:'pulse.example.test',url:'https://pulse.example.test',backupSource:'/tmp/pulse-config-backups',installed:m,postgresVolume:'fixture-original-postgres',minioVolume:'fixture-original-minio',caddyDataVolume:'fixture-caddy-data',caddyConfigVolume:'fixture-caddy-config',initialized:true};
      const env = join(dir,'deployment.env'); writeEnvironment(env,bootstrapEnvironment(install.project,install.hostname,mode));
      for (const kind of ['runtime','manager','restore']) {
        const obj = kind === 'manager' ? managerCompose(install,m.images.updater) : renderCompose(bundle,m,install,kind === 'restore' ? {project:'fixture-restore',postgres:'fixture-restore-postgres',minio:'fixture-restore-minio'} : undefined);
        const file = join(dir,`${kind}.json`); writeFileSync(file,JSON.stringify(obj));
        const rendered = JSON.parse(execFileSync('docker',['compose','--env-file',env,'-f',file,'--profile','maintenance','--profile','backup','--profile','restore','config','--format','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
        const services = rendered.services;
        for (const [name,value] of Object.entries<any>(services)) {
          assert.equal(value.build,undefined);
          if (name !== 'updater') assert.equal((value.volumes ?? []).some((v: any) => v.source === '/var/run/docker.sock'),false);
          if (name !== 'gateway') assert.equal(value.ports?.length ?? 0,0);
        }
        if (kind === 'runtime') {
          assert.equal(rendered.volumes['postgres-data'].name,install.postgresVolume);
          assert.equal(services['minio-backup'].volumes[0].source,'update-work');
          assert.equal(services['minio-backup'].volumes[0].type,'volume');
          assert.equal(rendered.networks.backend.name,'pulse-config-fixture_backend');
          assert.equal(services.api.environment.PULSE_UPDATER_URL,'http://pulse-updater:9050');
          assert.equal(services.api.volumes.find((v:any) => v.target === '/run/pulse-auth').read_only,true);
          if (mode === 'internal') assert.equal(services.gateway.ports[0].host_ip,'127.0.0.1');
        }
        if (kind === 'restore') {
          assert.equal(services.api,undefined); assert.equal(services.gateway,undefined);
          assert.equal(rendered.volumes['postgres-data'].name,'fixture-restore-postgres');
          assert.equal(rendered.volumes['minio-data'].name,'fixture-restore-minio');
          assert.equal(rendered.networks.backend.internal,true);
        }
      }
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:https';
import { rmSync } from 'node:fs';
import { atomicWrite } from '../src/store.mts';
import { digest } from '../src/release.mts';

function gateway(path: string, token?: string): Promise<{status:number;body:string}> {
  return new Promise((resolve,reject) => {
    const req = request(`https://gateway${path}`,{rejectUnauthorized:false,headers:token ? {Authorization:`Bearer ${token}`} : {}},res => {
      let body = ''; res.on('data',chunk => body += chunk); res.on('end',() => resolve({status:res.statusCode!,body}));
    });
    req.on('error',reject); req.end();
  });
}
test('Caddy enforces durable maintenance while exposing only job-scoped read status',async () => {
  for (let attempt=0;;attempt++) {
    try { await gateway('/'); break; } catch (error) { if (attempt >= 60) throw error; await new Promise(resolve => setTimeout(resolve,500)); }
  }
  const publish = (state: unknown) => atomicWrite('/status/state.json',JSON.stringify(state),0o644);
  publish({maintenance:true,tokenHash:digest('fixture-token'),job:{id:'fixture',stage:'migrating'}});
  assert.equal((await gateway('/api/clients')).status,503);
  assert.match((await gateway('/')).body,/Pulse is updating/);
  assert.equal((await gateway('/api/documents/fixture/preview')).status,503);
  assert.equal((await gateway('/_pulse/maintenance.js')).status,200);
  assert.equal((await gateway('/_pulse/status')).status,404);
  assert.equal((await gateway('/_pulse/status','wrong-token')).status,404);
  assert.equal(JSON.parse((await gateway('/_pulse/status','fixture-token')).body).job.stage,'migrating');
  assert.equal((await gateway('/_pulse/apply','fixture-token')).status,404);
  publish({maintenance:false});
  assert.equal((await gateway('/api/clients')).body,'application reached');
  rmSync('/status/state.json');
  assert.equal((await gateway('/api/clients')).status,503);
  atomicWrite('/status/state.json','{',0o644);
  assert.equal((await gateway('/api/clients')).status,503);
  publish({});
  assert.equal((await gateway('/api/clients')).status,503);
});

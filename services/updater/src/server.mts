import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Store, publicJob, terminal } from './store.mts';
import type { Job } from './store.mts';
import { compareVersions, digest, download, requireThat, UpdateError, versionPattern } from './release.mts';
import type { Manifest } from './release.mts';
import { docker, inspect, run } from './docker.mts';
import { DockerOperations, expectedLedger, fetchRelease } from './operations.mts';

const equal = (a: string,b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
function respond(res: ServerResponse, status: number, body: unknown) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(body)); }
async function body(req: IncomingMessage) {
  let data = ''; for await (const chunk of req) { data += chunk; requireThat(data.length <= 4096,'BODY_TOO_LARGE'); }
  try { return JSON.parse(data); } catch { throw new UpdateError('INVALID_REQUEST'); }
}
export function makeJob(store: Store, input: { releaseId: string; idempotencyKey: string; localRelease?: boolean; actor: {id: string; name: string} }): Job {
  requireThat(versionPattern.test(input.releaseId) && /^[a-zA-Z0-9_-]{16,100}$/.test(input.idempotencyKey) && typeof input.actor?.id === 'string' && typeof input.actor?.name === 'string' && input.actor.id.length <= 100 && input.actor.name.length <= 100,'INVALID_REQUEST');
  const active = store.active();
  if (active && active.idempotencyKey === input.idempotencyKey) { requireThat(active.releaseId === input.releaseId && active.actor.id === input.actor.id,'IDEMPOTENCY_CONFLICT'); return active; }
  if (active && !terminal.has(active.stage)) { requireThat(active.releaseId === input.releaseId && active.stage !== 'recovery-required','UPDATE_ALREADY_ACTIVE'); return active; }
  // Old idempotency keys cannot accidentally launch the same operation again.
  const prior = store.read<{jobId:string}>(`requests/${input.idempotencyKey}.json`);
  if (prior) { const job = store.job(prior.jobId); requireThat(job.releaseId === input.releaseId && job.actor.id === input.actor.id,'IDEMPOTENCY_CONFLICT'); return job; }
  const install = store.installation();
  const available = store.read<{manifest:Manifest}>('available.json');
  requireThat(available?.manifest.version === input.releaseId && compareVersions(input.releaseId,install.installed.version) > 0,'RELEASE_NOT_AVAILABLE');
  const now = new Date().toISOString();
  const job: Job = { id:randomUUID(),...input,stage:'queued',createdAt:now,updatedAt:now,migrationStarted:false,source:install.installed,statusToken:randomBytes(32).toString('base64url'),events:[{at:now,stage:'queued'}] };
  store.save(job); store.write(`requests/${input.idempotencyKey}.json`,{jobId:job.id}); return job;
}
export async function launchWorker(store: Store, job: Job) {
  const install = store.installation();
  const name = `${install.project}-update-${job.id}`;
  const existing = (await docker(['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}'])).trim();
  if (existing) {
    const container = await inspect(name);
    if (!container.State.Running && job.stage === 'queued') await docker(['start',name]);
    return;
  }
  await docker(['run','-d','--name',name,'--label',`io.pulse.installation=${install.id}`,'--restart','on-failure:3','--init','--read-only','--tmpfs','/tmp','--network',`${install.project}-control`,'--network',`${install.project}_egress`,'--volumes-from',`${install.project}-updater`,'--cap-drop','ALL','--security-opt','no-new-privileges:true',install.installed.images.updater,'worker',job.id]);
}
export async function serve(store: Store, keys: string[]) {
  let checking: Promise<unknown> | null = null;
  let submitting = false;
  const token = readFileSync('/auth/token','utf8').trim();
  const check = () => checking ??= (async () => {
    try {
      const releases = JSON.parse((await download('https://api.github.com/repos/Ricarudo/LBH-Pulse/releases?per_page=30')).toString('utf8')) as any[];
      requireThat(Array.isArray(releases),'INVALID_RELEASE_FEED');
      const candidates = releases.filter(r => !r.draft && !r.prerelease && typeof r.tag_name === 'string' && versionPattern.test(r.tag_name.slice(1)) && r.tag_name.startsWith('v')).sort((a,b) => compareVersions(b.tag_name.slice(1),a.tag_name.slice(1)));
      const install = store.installation();
      const latest = candidates.find(r => compareVersions(r.tag_name.slice(1),install.installed.version) > 0);
      const manifest = latest ? await fetchRelease(store,latest.tag_name.slice(1),keys) : null;
      store.write('available.json',{manifest,checkedAt:new Date().toISOString(),error:null});
    } catch { store.write('available.json',{manifest:null,checkedAt:new Date().toISOString(),error:'RELEASE_CHECK_FAILED'}); }
  })().finally(() => { checking = null; });
  const status = () => {
    const installed = store.installation();
    const available = store.read<{manifest:Manifest|null;checkedAt:string;error:string|null}>('available.json');
    const active = store.active();
    const recent = readdirSync(store.path('jobs'),{withFileTypes:true}).filter(x => /^[a-f0-9-]{36}\.json$/.test(x.name)).map(x => store.job(x.name.slice(0,-5))).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(publicJob);
    const candidate = available?.manifest;
    const manifest = candidate && compareVersions(candidate.version,installed.installed.version) > 0 ? candidate : null;
    const backupReady = existsSync('/secrets/age-identity.txt') && existsSync('/secrets/escrow-confirmed');
    const reason = active && !terminal.has(active.stage) ? 'UPDATE_ALREADY_ACTIVE' : !manifest ? available?.error ?? 'UP_TO_DATE' : !backupReady ? 'RECOVERY_KEY_ESCROW_REQUIRED' : compareVersions(installed.installed.version,manifest.upgrade.minimumVersion) < 0 ? 'INTERMEDIATE_RELEASE_REQUIRED' : expectedLedger(installed.installed).join() !== manifest.upgrade.sourceMigrations.join() ? 'SOURCE_LEDGER_MISMATCH' : null;
    return {managed:true,installedVersion:installed.installed.version,availableVersion:manifest?.version ?? null,releaseNotes:manifest?.releaseNotes ?? '',channel:'stable',backupReady,lastCheckedAt:available?.checkedAt ?? null,error:available?.error ?? null,eligible:!reason,reason,job:active ? publicJob(active) : null,history:recent};
  };
  const server = createServer(async (req,res) => {
    try {
      if (req.method === 'GET' && req.url === '/live') { respond(res,200,{status:'ok'}); return; }
      requireThat(equal(req.headers.authorization ?? '',`Bearer ${token}`),'UNAUTHORIZED');
      if (req.method === 'GET' && req.url === '/updates') respond(res,200,status());
      else if (req.method === 'POST' && req.url === '/check') { await check(); respond(res,200,status()); }
      else if (req.method === 'POST' && req.url === '/apply') {
        requireThat(!submitting,'UPDATE_ALREADY_ACTIVE'); submitting = true;
        try {
          const input = await body(req);
          requireThat(Object.keys(input).every(key => ['releaseId','idempotencyKey','actor'].includes(key)),'INVALID_REQUEST');
          const result = JSON.parse(await run('flock',['-w','5','/state/submission.lock','node','/opt/pulse/src/main.mts','enqueue'],{input:JSON.stringify(input)}));
          if (result.error) throw new UpdateError(result.error);
          respond(res,202,result);
        } finally { submitting = false; }
      } else if (req.method === 'GET' && /^\/jobs\/[a-f0-9-]{36}$/.test(req.url ?? '')) respond(res,200,{job:publicJob(store.job(req.url!.split('/').at(-1)!))});
      else respond(res,404,{error:'NOT_FOUND'});
    } catch (error) { const code = error instanceof UpdateError ? error.code : 'UPDATER_UNAVAILABLE'; respond(res,code === 'UNAUTHORIZED' ? 401 : code === 'UPDATER_UNAVAILABLE' ? 503 : 409,{error:code}); }
  });
  server.requestTimeout = 40_000;
  server.listen(9050,'0.0.0.0');
  const active = store.active();
  if (active && !terminal.has(active.stage) && active.stage !== 'recovery-required') {
    const name = `${store.installation().project}-update-${active.id}`;
    let alive = false; try { alive = (await inspect(name)).State.Running; } catch { /* missing worker */ }
    if (!alive && active.stage === 'queued') await launchWorker(store,active);
    else if (!alive) { store.stage(active,'recovery-required'); active.error = 'UPDATE_INTERRUPTED'; store.save(active); new DockerOperations(store,keys).publish(active,true); }
  }
  void check();
  setInterval(() => void check(),86_400_000).unref();
}

export function statusServer() {
  const read = () => { try { const state = JSON.parse(readFileSync('/status/state.json','utf8')); return {...state,maintenance:state?.maintenance !== false}; } catch { return {maintenance:true}; } };
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pulse maintenance</title><body style="font:18px system-ui;max-width:42rem;margin:15vh auto;padding:2rem"><h1>Pulse is updating</h1><p>Your data is being protected while this update completes. This page will reconnect automatically.</p><p id="status" role="status"></p><script src="/_pulse/maintenance.js"></script></body></html>';
  createServer((req,res) => {
    const state = read();
    if (req.url === '/live') { respond(res,200,{status:'ok'}); return; }
    if (req.url === '/gate') { res.writeHead(state.maintenance ? 503 : 204,{'Content-Type':'text/html','Cache-Control':'no-store','Retry-After':'10'}); res.end(state.maintenance ? html : ''); return; }
    if (req.url === '/_pulse/maintenance.js') { res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'}); res.end("setInterval(async()=>{try{const saved=JSON.parse(sessionStorage.getItem('pulse-update-job')||'null');if(saved?.statusToken){const r=await fetch('/_pulse/status',{headers:{Authorization:'Bearer '+saved.statusToken},cache:'no-store'});if(r.ok){const s=await r.json();document.getElementById('status').textContent=s.job.stage==='recovery-required'?'Operator recovery is required. Job: '+s.job.id:'Update stage: '+s.job.stage.replaceAll('-',' ');}}const r=await fetch('/_pulse/availability',{cache:'no-store'});const s=await r.json();if(!s.maintenance)location.href='/settings/updates';}catch{}},5000);"); return; }
    if (req.url === '/_pulse/availability') { respond(res,200,{maintenance:Boolean(state.maintenance)}); return; }
    if (req.url === '/_pulse/status' && typeof req.headers.authorization === 'string' && state.tokenHash && equal(digest(req.headers.authorization.replace(/^Bearer /,'')),state.tokenHash)) { respond(res,200,{job:state.job,maintenance:state.maintenance}); return; }
    respond(res,404,{error:'NOT_FOUND'});
  }).listen(9051,'0.0.0.0');
}

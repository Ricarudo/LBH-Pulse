import { createServer } from 'node:http';
import { mkdirSync, chmodSync } from 'node:fs';
import { managedRouting } from '../src/bootstrap.mts';
import { atomicWrite } from '../src/store.mts';

if (process.argv[2] === 'prepare') {
  mkdirSync('/status',{recursive:true}); chmodSync('/status',0o755);
  atomicWrite('/status/managed.caddy',managedRouting,0o644);
  atomicWrite('/status/state.json',JSON.stringify({maintenance:true}),0o644);
} else createServer((_req,res) => { res.writeHead(200); res.end('application reached'); }).listen(4300,'0.0.0.0');

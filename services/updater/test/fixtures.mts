import { generateKeyPairSync, sign } from 'node:crypto';
import { components, digest } from '../src/release.mts';
import type { Manifest } from '../src/release.mts';
export function release(version = '0.2.0'): Manifest {
  return { schemaVersion:3,product:'Pulse',version,tag:`v${version}`,commit:'a'.repeat(40),platform:'linux/amd64',minimumUpdaterProtocol:1,releaseNotes:'Test release',deployment:{asset:'deployment.json',sha256:digest('{}')},images:Object.fromEntries(components.map(c => [c,`${c === 'postgres' ? 'postgres' : c === 'minio' ? 'minio/minio' : c === 'minioMc' ? 'minio/mc' : 'ghcr.io/ricarudo/pulse-api'}@sha256:${'b'.repeat(64)}`])) as Manifest['images'],upgrade:{minimumVersion:'0.1.2',sourceMigrations:['202601010001_baseline'],targetMigrations:['202601010002_next'],rollbackPolicy:'restore-required-after-migration',postgresMajor:16}};
}
export function signed(m = release()) {
  const pair = generateKeyPairSync('ed25519'); const raw = Buffer.from(JSON.stringify(m));
  return {raw,sig:sign(null,raw,pair.privateKey),key:pair.publicKey.export({format:'pem',type:'spki'}).toString()};
}

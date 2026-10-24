import { createHash, createPublicKey, verify } from 'node:crypto';

export const protocol = 1;
export const components = ['api', 'web', 'maintenance', 'minioInit', 'clamav', 'backupCrypto', 'gatewayInternal', 'gatewayPublic', 'postgres', 'minio', 'minioMc', 'updater'] as const;
export type Component = typeof components[number];
export type Manifest = {
  schemaVersion: 3; product: 'Pulse'; version: string; tag: string; commit: string;
  platform: 'linux/amd64'; minimumUpdaterProtocol: number; releaseNotes: string;
  deployment: { sha256: string; asset: 'deployment.json' };
  images: Record<Component, string>;
  upgrade: { minimumVersion: string; sourceMigrations: string[]; targetMigrations: string[]; rollbackPolicy: 'restore-required-after-migration'; postgresMajor: 16 };
};
export class UpdateError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function requireThat(value: unknown, code: string): asserts value {
  if (!value) throw new UpdateError(code);
}
export const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function compareVersions(a: string, b: string) {
  requireThat(versionPattern.test(a) && versionPattern.test(b), 'INVALID_VERSION');
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
export function parseManifest(raw: Uint8Array | string): Manifest {
  let m: Manifest;
  try { m = JSON.parse(Buffer.from(raw).toString('utf8')); } catch { throw new UpdateError('INVALID_MANIFEST'); }
  requireThat(m?.schemaVersion === 3 && m.product === 'Pulse' && m.platform === 'linux/amd64', 'UNSUPPORTED_MANIFEST');
  requireThat(versionPattern.test(m.version) && m.tag === `v${m.version}` && /^[a-f0-9]{40}$/.test(m.commit), 'INVALID_MANIFEST');
  requireThat(Number.isInteger(m.minimumUpdaterProtocol) && m.minimumUpdaterProtocol > 0 && m.minimumUpdaterProtocol <= protocol, 'UPDATER_UPGRADE_REQUIRED');
  requireThat(m.deployment?.asset === 'deployment.json' && /^[a-f0-9]{64}$/.test(m.deployment.sha256), 'INVALID_BUNDLE_HASH');
  requireThat(typeof m.releaseNotes === 'string' && m.releaseNotes.length <= 100_000, 'INVALID_RELEASE_NOTES');
  for (const name of components) {
    // Application images may only come from the Pulse publisher. Infrastructure is
    // explicitly enumerated; a signed manifest is still not an arbitrary Docker API.
    const prefix = name === 'postgres' ? '(?:docker.io/library/)?postgres' : name === 'minio' ? '(?:docker.io/)?minio/minio' : name === 'minioMc' ? '(?:docker.io/)?minio/mc' : 'ghcr.io/ricarudo/pulse-[a-z-]+';
    requireThat(new RegExp(`^${prefix}@sha256:[a-f0-9]{64}$`).test(m.images?.[name]), 'UNTRUSTED_IMAGE');
  }
  const u = m.upgrade;
  requireThat(u && versionPattern.test(u.minimumVersion) && compareVersions(u.minimumVersion, m.version) < 0 && u.rollbackPolicy === 'restore-required-after-migration' && u.postgresMajor === 16, 'UNSUPPORTED_UPGRADE');
  requireThat(Array.isArray(u.sourceMigrations) && Array.isArray(u.targetMigrations), 'INVALID_MIGRATIONS');
  const all = [...u.sourceMigrations, ...u.targetMigrations];
  requireThat(all.length > 0 && all.every(x => typeof x === 'string' && /^\d{12}_[a-z0-9_]+$/.test(x)) && new Set(all).size === all.length && all.join() === [...all].sort().join(), 'INVALID_MIGRATIONS');
  return m;
}
export function verifyRelease(raw: Uint8Array, signature: Uint8Array, keys: string[]): Manifest {
  requireThat(keys.length > 0 && signature.length === 64, 'UNTRUSTED_SIGNATURE');
  requireThat(keys.some(key => {
    try { const publicKey = createPublicKey(key); return publicKey.asymmetricKeyType === 'ed25519' && verify(null, raw, publicKey, signature); } catch { return false; }
  }), 'UNTRUSTED_SIGNATURE');
  return parseManifest(raw);
}
export function assertUpgrade(current: string, target: Manifest, ledger: string[]) {
  requireThat(compareVersions(target.version, current) > 0, 'DOWNGRADE_OR_REINSTALL_REJECTED');
  requireThat(compareVersions(current, target.upgrade.minimumVersion) >= 0, 'INTERMEDIATE_RELEASE_REQUIRED');
  requireThat(JSON.stringify(ledger) === JSON.stringify(target.upgrade.sourceMigrations), 'SOURCE_LEDGER_MISMATCH');
}

const releaseRoot = 'https://github.com/Ricarudo/LBH-Pulse/releases/download/';
export const releaseURL = (version: string, asset: string) => {
  requireThat(versionPattern.test(version) && ['release-manifest.json', 'release-manifest.sig', 'deployment.json'].includes(asset), 'INVALID_RELEASE_ID');
  return `${releaseRoot}v${version}/${asset}`;
};
export async function download(url: string, maxBytes = 2_000_000): Promise<Buffer> {
  // Only GitHub release redirects are followed; no caller-supplied origin or URL.
  for (let redirects = 0; redirects < 5; redirects++) {
    const parsed = new URL(url);
    requireThat(parsed.protocol === 'https:' && !parsed.username && !parsed.password && ['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname), 'UNTRUSTED_DOWNLOAD_HOST');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Pulse-Updater', Accept: 'application/vnd.github+json' } });
    if ([301,302,303,307,308].includes(response.status)) { const location = response.headers.get('location'); requireThat(location, 'DOWNLOAD_FAILED'); await response.body?.cancel(); url = new URL(location, url).href; continue; }
    requireThat(response.ok && response.body, 'RELEASE_UNAVAILABLE');
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > maxBytes) { throw new UpdateError('DOWNLOAD_TOO_LARGE'); } chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw new UpdateError('TOO_MANY_REDIRECTS');
}
